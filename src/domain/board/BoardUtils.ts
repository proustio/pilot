export function getIndex(x: number, z: number, width: number): number {
    return z * width + x;
}

export function getCoords(index: number, width: number): { x: number, z: number } {
    return {
        x: index % width,
        z: Math.floor(index / width)
    };
}
