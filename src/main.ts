import { Engine3D } from './presentation/3d/Engine3D';
import { EntityManager } from './presentation/3d/entities/EntityManager';
import { InteractionManager } from './presentation/3d/interaction/InteractionManager';

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
