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
 * Setup touch long press handler for mobile devices
 */
export function setupTouchLongPress(
  container: HTMLElement,
  mapInstance: L.Map,
  onLongPress: (latlng: L.LatLng) => void
): () => void {
  const state: LongPressState = { timer: null, startPos: null, latLng: null };

  const clearState = () => {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.startPos = null;
    state.latLng = null;
  };

  const handleTouchStart = (e: TouchEvent) => {
    clearState();
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
      clearState();
    }, LONG_PRESS_DURATION_MS);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!state.timer || !state.startPos) return;
    const touch = e.touches[0];
    const dx = touch.clientX - state.startPos.x;
    const dy = touch.clientY - state.startPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > TOUCH_MOVE_THRESHOLD_PX) {
      clearState();
    }
  };

  const handleTouchEnd = () => clearState();

  container.addEventListener('touchstart', handleTouchStart, { passive: false });
  container.addEventListener('touchmove', handleTouchMove, { passive: true });
  container.addEventListener('touchend', handleTouchEnd, { passive: true });
  container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  return () => {
    clearState();
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
  const state: LongPressState = { timer: null, startPos: null, latLng: null };

  const clearState = () => {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.startPos = null;
    state.latLng = null;
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    clearState();
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
      clearState();
    }, LONG_PRESS_DURATION_MS);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!state.timer || !state.startPos) return;
    const dx = e.clientX - state.startPos.x;
    const dy = e.clientY - state.startPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOUSE_MOVE_THRESHOLD_PX) {
      clearState();
    }
  };

  const handleMouseUp = () => clearState();

  container.addEventListener('mousedown', handleMouseDown);
  container.addEventListener('mousemove', handleMouseMove);
  container.addEventListener('mouseup', handleMouseUp);
  container.addEventListener('mouseleave', handleMouseUp);

  return () => {
    clearState();
    container.removeEventListener('mousedown', handleMouseDown);
    container.removeEventListener('mousemove', handleMouseMove);
    container.removeEventListener('mouseup', handleMouseUp);
    container.removeEventListener('mouseleave', handleMouseUp);
  };
}
