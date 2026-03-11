import { Engine3D } from './presentation/3d/Engine3D';
import { EntityManager } from './presentation/3d/entities/EntityManager';
import { InteractionManager } from './presentation/3d/interaction/InteractionManager';
import { GameLoop } from './application/game-loop/GameLoop';
import { UIManager } from './presentation/ui/UIManager';
console.log('Battleships: Initialization Started');

const init = () => {
    try {
        // 1. Initialize core 3D Engine
        const engine = new Engine3D('app');
        
        // 2. Initialize Game Entities (Board, Ships placeholder)
        const entityManager = new EntityManager(engine.scene);
        
        // 3. Initialize Interaction (Raycasting, Hovering)
        const interactionManager = new InteractionManager(
            engine.scene, 
            engine.camera, 
            entityManager
        );

        // 4. Initialize Core Game Loop Logic
        const gameLoop = new GameLoop();
        
        // Pass gameLoop to InteractionManager for context-aware raycasting
        interactionManager.setGameLoop(gameLoop);
        
        // 5. Initialize UI Manager (Hooks UI into GameLoop)
        const uiManager = new UIManager(gameLoop);
        (window as any).uiManager = uiManager; // Expose to window for debugging and prevent unused warning

        // Connect 3D clicks to GameLoop logic
        interactionManager.onClick((hit: any) => {
            const gridX = hit.object.userData.cellX;
            const gridZ = hit.object.userData.cellZ;
            gameLoop.onGridClick(gridX, gridZ);
        });

        // Listen to Game Events to trigger visuals
        gameLoop.onShipPlaced((ship, x, z, orientation, isPlayer) => {
            entityManager.addShip(ship, x, z, orientation, isPlayer);
        });

        gameLoop.onAttackResult((x, z, result, isPlayer) => {
            entityManager.addAttackMarker(x, z, result, isPlayer);
        });

        // Define the main render loop with a 60 FPS cap
        const FPS_CAP = 60;
        const frameInterval = 1000 / FPS_CAP;
        let lastFrameTime = performance.now();
        
        // FPS Counter variables
        let framesRendered = 0;
        let lastFpsUpdateTime = performance.now();

        const animate = (time: DOMHighResTimeStamp) => {
            requestAnimationFrame(animate);
            
            const deltaTime = time - lastFrameTime;
            
            if (deltaTime < frameInterval) {
                // Skip frame if it arrived too early to enforce FPS cap
                return;
            }
            
            lastFrameTime = time - (deltaTime % frameInterval);
            
            // Calculate FPS
            framesRendered++;
            if (time - lastFpsUpdateTime >= 1000) {
                const fps = Math.round((framesRendered * 1000) / (time - lastFpsUpdateTime));
                document.dispatchEvent(new CustomEvent('UPDATE_FPS', { detail: { fps } }));
                framesRendered = 0;
                lastFpsUpdateTime = time;
            }
            
            // Update systems if not paused
            if (!gameLoop.isPaused) {
                interactionManager.update();
                entityManager.update();
            }
            
            // Render frame
            engine.render();
        };

        // Listen for internal game state to flip board
        gameLoop.onStateChange((newState) => {
            if (newState === 'SETUP_BOARD') {
                entityManager.showPlayerBoard();
                engine.targetCameraPos.set(0, 10, 12);
            } else if (newState === 'ENEMY_TURN') {
                entityManager.showPlayerBoard();
                engine.targetCameraPos.set(0, 14, 18); // Pulled back slightly
            } else if (newState === 'PLAYER_TURN') {
                entityManager.showEnemyBoard();
                engine.targetCameraPos.set(0, 12, 12); // Closer for action
            }
        });

        // Start loop
        animate(performance.now());
        console.log('App successfully initialized, loop running.');

    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
};

// Wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
