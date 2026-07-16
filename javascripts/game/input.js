// Keyboard bindings are declared via kaplay({ buttons: {...} }) in main.js.
// This module only wires the custom-styled HTML touch buttons (kept as
// themed DOM elements rather than Kaplay's own touch handling) into
// Kaplay's virtual button system via pressButton()/releaseButton(), so
// isButtonDown()/onButtonPress() in main.js see keyboard and touch input
// identically.
export function setupTouchControls(touchControlsEl) {
  if (!touchControlsEl) return;

  touchControlsEl.querySelectorAll("[data-action]").forEach((button) => {
    const action = button.dataset.action;

    const press = (event) => {
      event.preventDefault();
      pressButton(action);
    };
    const release = (event) => {
      event.preventDefault();
      releaseButton(action);
    };

    button.addEventListener("touchstart", press, { passive: false });
    button.addEventListener("touchend", release, { passive: false });
    button.addEventListener("touchcancel", release, { passive: false });
    button.addEventListener("mousedown", press);
    button.addEventListener("mouseup", release);
    button.addEventListener("mouseleave", release);
  });
}
