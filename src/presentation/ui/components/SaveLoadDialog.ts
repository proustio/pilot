import { BaseUIComponent } from './BaseUIComponent';
import { Storage, SaveMetadata } from '../../../infrastructure/storage/Storage';
import { Config } from '../../../infrastructure/config/Config';

export type SaveLoadMode = 'save' | 'load';

export class SaveLoadDialog extends BaseUIComponent {
    private mode: SaveLoadMode = 'load';

    constructor() {
        super('save-load-dialog');
        this.container.classList.add('voxel-panel');
        this.container.style.zIndex = '200';
    }

    public openAs(mode: SaveLoadMode): void {
        this.mode = mode;
        this.render();
        this.show();
    }

    protected onShow(): void {
        document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: false } }));
    }

    protected onHide(): void {
        document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: true } }));
    }

    protected render(): void {
        const title = this.mode === 'save' ? 'Save Game' : 'Load Game';

        let slotsHtml = '';
        for (let i = 1; i <= Config.storage.maxSlots; i++) {
            const meta = Storage.getSlotMetadata(i);
            const isEmpty = !meta;

            const slotContent = isEmpty
                ? `<span class="slot-empty">— Empty —</span>`
                : `<span class="slot-mode">${(meta as SaveMetadata).mode.toUpperCase()}</span>
                   <span class="slot-date">${new Date((meta as SaveMetadata).date).toLocaleString()}</span>
                   <span class="slot-turns">Turns: ${(meta as SaveMetadata).turnCount}</span>`;

            const isDisabled = this.mode === 'load' && isEmpty;
            const disabledClass = isDisabled ? 'slot-disabled' : '';

            slotsHtml += `
                <div class="slot-wrapper">
                    <button class="save-slot voxel-btn ${disabledClass}" data-slot="${i}" ${isDisabled ? 'disabled' : ''}>
                        <div class="slot-header">Slot ${i}</div>
                        <div class="slot-info">${slotContent}</div>
                    </button>
                    ${!isEmpty ? `
                    <button class="slot-delete-btn voxel-btn danger" data-slot="${i}" title="Delete Save">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>` : ''}
                </div>
            `;
        }

        this.container.innerHTML = `
            <h2 class="voxel-title" style="font-size: 2rem;">${title}</h2>
            <div class="save-slots-container">
                ${slotsHtml}
            </div>
            <button id="btn-close-save-load" class="voxel-btn" style="margin-top: 15px;">Cancel</button>
            <div id="confirm-overlay" class="confirm-overlay" style="display:none;">
                <div class="confirm-dialog voxel-panel">
                    <p id="confirm-message">Overwrite this save?</p>
                    <div style="display:flex; gap:10px; justify-content:center;">
                        <button id="confirm-yes" class="voxel-btn primary" style="width:auto; padding:10px 24px;">Yes</button>
                        <button id="confirm-no" class="voxel-btn" style="width:auto; padding:10px 24px;">No</button>
                    </div>
                </div>
            </div>
        `;

        // Close button
        const closeBtn = this.container.querySelector('#btn-close-save-load') as HTMLButtonElement;
        closeBtn.addEventListener('click', () => this.hide());

        // Slot clicks
        const slotButtons = this.container.querySelectorAll('.save-slot');
        slotButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const slotId = parseInt((btn as HTMLElement).dataset.slot || '0');
                if (slotId < 1) return;

                if (this.mode === 'save') {
                    const hasSave = Storage.hasSave(slotId);
                    if (hasSave) {
                        this.showConfirm('Overwrite this save?', () => {
                            this.doSave(slotId);
                        });
                    } else {
                        this.doSave(slotId);
                    }
                } else {
                    this.doLoad(slotId);
                }
            });
        });

        // Delete clicks
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

    private doSave(slotId: number): void {
        document.dispatchEvent(new CustomEvent('SAVE_GAME', { detail: { slotId } }));
        // Re-render to show updated slot info
        this.render();
    }

    private doLoad(slotId: number): void {
        document.dispatchEvent(new CustomEvent('LOAD_GAME', { detail: { slotId } }));
        this.hide();
    }
}
