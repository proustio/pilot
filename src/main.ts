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
            entityManager.getInteractableObjects()
        );

        // 4. Initialize Core Game Loop Logic
        const gameLoop = new GameLoop();
        
        // 5. Initialize UI Manager (Hooks UI into GameLoop)
        const uiManager = new UIManager(gameLoop);
        (window as any).uiManager = uiManager; // Expose to window for debugging and prevent unused warning

        // Connect 3D clicks to GameLoop logic
        interactionManager.onClick((intersection: any) => {
            // Placeholder: convert 3D hit point to grid coordinate
            const gridX = Math.round(intersection.point.x);
            const gridZ = Math.round(intersection.point.z);
            gameLoop.onGridClick(gridX, gridZ);
        });

        // Define the main render loop
        const animate = () => {
            requestAnimationFrame(animate);
            
            // Update systems
            interactionManager.update();
            
            // Render frame
            engine.render();
        };

        // Start loop
        animate();
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
