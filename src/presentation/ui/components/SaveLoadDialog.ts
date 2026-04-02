import { BaseUIComponent } from './BaseUIComponent';
import { Storage } from '../../../infrastructure/storage/Storage';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { Config } from '../../../infrastructure/config/Config';
import { TemplateEngine } from '../templates/TemplateEngine';
import saveLoadDialogTemplate from '../templates/SaveLoadDialog.html?raw';
import saveSlotTemplate from '../templates/SaveSlot.html?raw';

export type SaveLoadMode = 'save' | 'load';

export class SaveLoadDialog extends BaseUIComponent {
    private mode: SaveLoadMode = 'load';

    constructor() {
        super('save-load-dialog');
        this.container.classList.add('absolute', 'top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2', 'bg-[rgba(20,20,20,0.55)]', 'backdrop-blur-[8px]', 'border-4', 'border-[#333]', 'rounded', 'shadow-voxel-panel', 'text-[#eee]', 'p-8', 'pointer-events-auto', 'text-shadow-voxel', 'z-[200]', 'w-[900px]', 'max-w-[95vw]', 'max-h-[90vh]', 'overflow-hidden', 'flex', 'flex-row', 'gap-8');
    }

    public openAs(mode: SaveLoadMode): void {
        this.mode = mode;
        this.render();
        this.show();
    }

    protected onShow(): void {
        eventBus.emit(GameEventType.PAUSE_GAME, undefined);
        eventBus.emit(GameEventType.SET_INTERACTION_ENABLED, { enabled: false });
    }

    protected onHide(): void {
        eventBus.emit(GameEventType.SHOW_PAUSE_MENU, undefined);
    }

    protected render(): void {
        const title = this.mode === 'save' ? 'Save Game' : 'Load Game';

        let slotsHtml = '';
        for (let i = 1; i <= Config.storage.maxSlots; i++) {
            const meta = Storage.getSlotMetadata(i);
            const isEmpty = !meta;
            const isDisabled = this.mode === 'load' && isEmpty;
            const disabledClass = isDisabled ? 'slot-disabled' : '';

            slotsHtml += TemplateEngine.render(saveSlotTemplate, {
                i,
                meta,
                isEmpty,
                isDisabled,
                disabledClass
            });
        }

        this.container.innerHTML = TemplateEngine.render(saveLoadDialogTemplate, {
            title,
            slotsHtml
        });

        const closeBtn = this.container.querySelector('#btn-close-save-load') as HTMLButtonElement;
        closeBtn.addEventListener('click', () => this.hide());

        const slotButtons = this.container.querySelectorAll('.save-slot');
        slotButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const slotId = parseInt((btn as HTMLElement).dataset.slot || '0');
                if (slotId < 1) return;

                if (this.mode === 'save') {
                    const hasSave = Storage.hasSave(slotId);
                    if (hasSave) {
                        this.showConfirm('Overwrite this save?', () => {
                            eventBus.emit(GameEventType.SAVE_GAME, { slotId });
                            this.hide();
                        });
                    } else {
                        eventBus.emit(GameEventType.SAVE_GAME, { slotId });
                        this.hide();
                    }
                } else {
                    eventBus.emit(GameEventType.LOAD_GAME, { slotId });
                    this.hide();
                }
            });
        });

        const deleteButtons = this.container.querySelectorAll('.slot-delete-btn');
        deleteButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const slotId = parseInt((btn as HTMLElement).dataset.slot || '0');
                if (slotId < 1) return;

                this.showConfirm(`Delete save in Slot ${slotId}?`, () => {
                    Storage.clearSave(slotId);
                    this.render();
                });
            });
        });
    }

    private showConfirm(message: string, onConfirm: () => void): void {
        const overlay = this.container.querySelector('#confirm-overlay') as HTMLElement;
        const msg = this.container.querySelector('#confirm-message') as HTMLElement;
        const yesBtn = this.container.querySelector('#confirm-yes') as HTMLButtonElement;
        const noBtn = this.container.querySelector('#confirm-no') as HTMLButtonElement;

        msg.textContent = message;
        overlay.style.display = 'flex';

        const cleanup = () => {
            overlay.style.display = 'none';
            yesBtn.replaceWith(yesBtn.cloneNode(true));
            noBtn.replaceWith(noBtn.cloneNode(true));
        };

        yesBtn.addEventListener('click', () => { cleanup(); onConfirm(); }, { once: true });
        noBtn.addEventListener('click', () => { cleanup(); }, { once: true });
    }
}
