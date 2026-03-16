export abstract class BaseUIComponent {
    protected container: HTMLElement;
    protected isVisible: boolean = false;

    constructor(id: string) {
        this.container = document.createElement('div');
        this.container.id = id;
        this.container.classList.add('ui-component');
        this.container.style.display = 'none';
    }

    /**
     * Mounts the component to the DOM.
     * @param parentElement The parent element to mount to.
     */
    public mount(parentElement: HTMLElement): void {
        parentElement.appendChild(this.container);
        this.render();
        this.attachSoundListeners();
    }

    /**
     * Attaches sound listeners to interactive elements within this component.
     */
    protected attachSoundListeners(): void {
        const interactiveElements = this.container.querySelectorAll('button, .voxel-btn, .mini-cell, input, select');
        interactiveElements.forEach(el => {
            el.addEventListener('mouseenter', () => {
                document.dispatchEvent(new CustomEvent('PLAY_SOUND', { detail: 'bubblePop' }));
            });
        });
    }

    /**
     * Unmounts the component from the DOM.
     */
    public unmount(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }

    /**
     * Abstract render method to be implemented by child classes.
     * Use this to populate this.container with HTML.
     */
    protected abstract render(): void;

    /**
     * Shows the UI component.
     */
    public show(): void {
        if (!this.isVisible) {
            this.container.style.display = 'flex'; // Or appropriate display type
            this.isVisible = true;
            this.onShow();
            this.attachSoundListeners(); // re-attach in case render changed things
        }
    }

    /**
     * Hides the UI component.
     */
    public hide(): void {
        if (this.isVisible) {
            this.container.style.display = 'none';
            this.isVisible = false;
            this.onHide();
        }
    }

    /**
     * Lifecycle hooks
     */
    protected onShow(): void {}
    protected onHide(): void {}
}
