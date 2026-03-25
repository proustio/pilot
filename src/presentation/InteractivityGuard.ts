/**
 * Central guard to manage interactivity across 3D and UI layers.
 * Prevents accidental actions during animations, camera movement, or menu browsing.
 */
import { eventBus, GameEventType } from '../application/events/GameEventBus';

export class InteractivityGuard {
    private static cameraInteracting = false;
    private static cameraInteractedRecently = false;
    private static cameraTransitioning = false;
    private static gameAnimating = false;
    private static menuOpen = false;

    /**
     * Sets whether the user is currently interacting with the camera (e.g., rotating/zooming).
     */
    public static setCameraInteracting(state: boolean) {
        if (this.cameraInteracting === state) return;
        
        // If we just stopped interacting, set the "recently" flag to block trailing click events
        if (!state && this.cameraInteracting) {
            this.cameraInteractedRecently = true;
            setTimeout(() => { 
                this.cameraInteractedRecently = false; 
                this.update(); // FIX: Must update to clear ghostly phase!
            }, 100);
        }
        
        this.cameraInteracting = state;
        this.update();
    }

    /**
     * Sets whether the camera is automatically transitioning (e.g., turn flip).
     */
    public static setCameraTransitioning(state: boolean) {
        if (this.cameraTransitioning === state) return;
        this.cameraTransitioning = state;
        this.update();
    }

    /**
     * Sets whether the game is currently playing a turn animation (e.g., shot sequence).
     */
    public static setGameAnimating(state: boolean) {
        if (this.gameAnimating === state) return;
        this.gameAnimating = state;
        this.update();
    }

    /**
     * Sets whether a system menu or dialog is currently open.
     */
    public static setMenuOpen(state: boolean) {
        if (this.menuOpen === state) return;
        this.menuOpen = state;
        this.update();
    }

    /**
     * Returns true if any interaction should be blocked.
     */
    public static isBlocked(): boolean {
        return this.cameraInteracting || this.cameraInteractedRecently || this.cameraTransitioning || this.gameAnimating || this.menuOpen;
    }

    /**
     * Returns true if the pointer is currently over a UI element that should block 3D interaction.
     */
    public static isPointerOverUI(clientX: number, clientY: number): boolean {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el) return false;
        
        // If the element is within the UI layer, it should block interaction
        return !!el.closest('#ui-layer');
    }


    /**
     * Returns true if ONLY camera-related blocking is active.
     */
    public static isCameraMoving(): boolean {
        return this.cameraInteracting;
    }

    private static update() {
        const blocked = this.isBlocked();
        
        // Use CSS class on body for UI-wide blocking
        if (blocked) {
            document.body.classList.add('interactivity-blocked');
        } else {
            document.body.classList.remove('interactivity-blocked');
        }
        
        // Dispatch event for components that need to react specifically
        eventBus.emit(GameEventType.INTERACTION_GUARD_STATE, { 
            blocked,
            cameraInteracting: this.cameraInteracting,
            gameAnimating: this.gameAnimating,
            menuOpen: this.menuOpen
        });
    }
}
