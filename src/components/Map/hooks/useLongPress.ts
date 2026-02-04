/**
 * Long press handlers for MapView
 * Provides touch and mouse long press detection for map interactions
 */

// Long press configuration
export const LONG_PRESS_DURATION_MS = 500;
export const TOUCH_MOVE_THRESHOLD_PX = 10;
export const MOUSE_MOVE_THRESHOLD_PX = 5;

interface LongPressState {
  timer: ReturnType<typeof setTimeout> | null;
  startPos: { x: number; y: number } | null;
  latLng: L.LatLng | null;
}

/**
 * Creates a fresh long press state object
 */
function createLongPressState(): LongPressState {
  return { timer: null, startPos: null, latLng: null };
}

/**
 * Clears the long press state and cancels any pending timer
 */
function clearLongPressState(state: LongPressState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.startPos = null;
  state.latLng = null;
}

/**
 * Checks if movement exceeds threshold, returns true if long press should be cancelled
 */
function hasMovedBeyondThreshold(
  currentX: number,
  currentY: number,
  startPos: { x: number; y: number },
  threshold: number
): boolean {
  const dx = currentX - startPos.x;
  const dy = currentY - startPos.y;
  return Math.sqrt(dx * dx + dy * dy) > threshold;
}

/**
 * Setup touch long press handler for mobile devices
 */
export function setupTouchLongPress(
  container: HTMLElement,
  mapInstance: L.Map,
  onLongPress: (latlng: L.LatLng) => void
): () => void {
  const state = createLongPressState();

  const handleTouchStart = (e: TouchEvent) => {
    clearLongPressState(state);
    const touch = e.touches[0];
    state.startPos = { x: touch.clientX, y: touch.clientY };
    try {
      const containerPoint = mapInstance.mouseEventToContainerPoint({
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as MouseEvent);
      state.latLng = mapInstance.containerPointToLatLng(containerPoint);
    } catch {
      return;
    }
    state.timer = setTimeout(() => {
      if (state.latLng) {
        e.preventDefault();
        onLongPress(state.latLng);
      }
      clearLongPressState(state);
    }, LONG_PRESS_DURATION_MS);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!state.timer || !state.startPos) return;
    const touch = e.touches[0];
    if (hasMovedBeyondThreshold(touch.clientX, touch.clientY, state.startPos, TOUCH_MOVE_THRESHOLD_PX)) {
      clearLongPressState(state);
    }
  };

  const handleTouchEnd = () => clearLongPressState(state);

  container.addEventListener('touchstart', handleTouchStart, { passive: false });
  container.addEventListener('touchmove', handleTouchMove, { passive: true });
  container.addEventListener('touchend', handleTouchEnd, { passive: true });
  container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  return () => {
    clearLongPressState(state);
    container.removeEventListener('touchstart', handleTouchStart);
    container.removeEventListener('touchmove', handleTouchMove);
    container.removeEventListener('touchend', handleTouchEnd);
    container.removeEventListener('touchcancel', handleTouchEnd);
  };
}

/**
 * Setup mouse long press handler for desktop
 */
export function setupMouseLongPress(
  container: HTMLElement,
  mapInstance: L.Map,
  onLongPress: (latlng: L.LatLng) => void
): () => void {
  const state = createLongPressState();

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    clearLongPressState(state);
    state.startPos = { x: e.clientX, y: e.clientY };
    try {
      const containerPoint = mapInstance.mouseEventToContainerPoint(e);
      state.latLng = mapInstance.containerPointToLatLng(containerPoint);
    } catch {
      return;
    }
    state.timer = setTimeout(() => {
      if (state.latLng) {
        onLongPress(state.latLng);
      }
      clearLongPressState(state);
    }, LONG_PRESS_DURATION_MS);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!state.timer || !state.startPos) return;
    if (hasMovedBeyondThreshold(e.clientX, e.clientY, state.startPos, MOUSE_MOVE_THRESHOLD_PX)) {
      clearLongPressState(state);
    }
  };

  const handleMouseUp = () => clearLongPressState(state);

  container.addEventListener('mousedown', handleMouseDown);
  container.addEventListener('mousemove', handleMouseMove);
  container.addEventListener('mouseup', handleMouseUp);
  container.addEventListener('mouseleave', handleMouseUp);

  return () => {
    clearLongPressState(state);
    container.removeEventListener('mousedown', handleMouseDown);
    container.removeEventListener('mousemove', handleMouseMove);
    container.removeEventListener('mouseup', handleMouseUp);
    container.removeEventListener('mouseleave', handleMouseUp);
  };
}
