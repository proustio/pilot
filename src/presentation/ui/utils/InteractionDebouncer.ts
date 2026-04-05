import { Config } from '../../../infrastructure/config/Config';

let lastInteractionTime = -1000;
let isEnabled = false;
let globalListener: ((e: MouseEvent) => void) | null = null;

export const InteractionDebouncer = {
    enable() {
        if (isEnabled) return;
        isEnabled = true;
        
        globalListener = (e: MouseEvent) => {
            const now = performance.now();
            if (now - lastInteractionTime < Config.timing.interactionTimeout) {
                e.stopImmediatePropagation();
                e.stopPropagation();
                e.preventDefault();
            } else {
                lastInteractionTime = now;
            }
        };

        window.addEventListener('click', globalListener, true);
    },

    disable() {
        if (!isEnabled || !globalListener) return;
        window.removeEventListener('click', globalListener, true);
        isEnabled = false;
        globalListener = null;
    },

    resetTimer() {
        lastInteractionTime = -1000;
    }
};
