import { GameLoop } from '../../../application/game-loop/GameLoop';

/**
 * Renders ship silhouettes with damage segments for a fleet.
 */
export function renderFleetIcons(container: HTMLElement, ships: any[]): void {
    container.innerHTML = '';
    const sortedShips = [...ships].sort((a, b) => b.size - a.size);

    sortedShips.forEach(ship => {
        const icon = document.createElement('div');
        icon.classList.add('ship-icon');
        if (ship.isSunk()) icon.classList.add('sunk');

        for (let i = 0; i < ship.size; i++) {
            const segment = document.createElement('div');
            segment.classList.add('ship-segment');
            
            // Reflect individual segment hits
            if (ship.segments[i] === false) {
                segment.classList.add('hit');
            }
            
            icon.appendChild(segment);
        }
        container.appendChild(icon);
    });
}

/**
 * Updates the game statistic readouts (shots, ratio, win probability).
 */
export function updateGameStats(container: HTMLElement, gameLoop: GameLoop): void {
    if (!gameLoop.match) return;

    const playerBoard = gameLoop.match.playerBoard;
    const enemyBoard = gameLoop.match.enemyBoard;

    const shots = enemyBoard.shotsFired;
    const hits = enemyBoard.hits;
    const ratio = shots > 0 ? Math.round((hits / shots) * 100) : 0;

    const shotsEl = container.querySelector('#stat-shots');
    const ratioEl = container.querySelector('#stat-ratio');
    const probEl = container.querySelector('#stat-prob');

    if (shotsEl) shotsEl.textContent = shots.toString();
    if (ratioEl) ratioEl.textContent = `${ratio}%`;

    // Calculate Win Probability based on remaining "HP" (unhit segments)
    const getRemainingHP = (board: any) => {
        let unhit = 0;
        board.ships.forEach((ship: any) => {
            unhit += ship.segments.filter((s: boolean) => s === true).length;
        });
        return unhit;
    };

    const playerHP = getRemainingHP(playerBoard);
    const enemyHP = getRemainingHP(enemyBoard);
    const totalHP = playerHP + enemyHP;
    
    let prob = 50;
    if (totalHP > 0) {
        // Simple linear probability: myHP / totalHP
        prob = Math.round((playerHP / totalHP) * 100);
    }

    if (probEl) probEl.textContent = `${prob}%`;
}
