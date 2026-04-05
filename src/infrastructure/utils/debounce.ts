export function debounce<T extends (...args: any[]) => void>(func: T, timeout: number): T {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return ((...args: any[]) => {
        if (!timer) {
            func(...args);
        } else {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            timer = null;
        }, timeout);
    }) as T;
}
