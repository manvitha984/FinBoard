export function startPolling(fn: () => Promise<void>, everyMs: number) {
  let timer: ReturnType<typeof setInterval> | null = null;
  const start = () => {
    stop();
    timer = setInterval(() => void fn(), Math.max(1000, everyMs));
    void fn(); 
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  return { start, stop };
}