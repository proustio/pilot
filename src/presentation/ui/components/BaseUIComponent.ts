export abstract class BaseUIComponent {
    protected container: HTMLElement;
    protected isVisible: boolean = false;

    constructor(id: string) {
        this.container = document.createElement('div');
        this.container.id = id;
        this.container.classList.add('hidden');
    }

    /**
     * Mounts the component to the DOM.
     * @param parentElement The parent element to mount to.
     */
    public mount(parentElement: HTMLElement): void {
        parentElement.appendChild(this.container);
        this.render();
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
            this.container.classList.remove('hidden');
            this.container.classList.add('flex');
            this.container.classList.add('items-center');
            this.container.classList.add('justify-center');
            this.isVisible = true;
            this.onShow();
        }
    }

    /**
     * Hides the UI component.
     */
    public hide(): void {
        if (this.isVisible) {
            this.container.classList.add('hidden');
            this.container.classList.remove('flex');
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
