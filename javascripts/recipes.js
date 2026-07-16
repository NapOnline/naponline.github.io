document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-recipe-trigger]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const dialog = document.getElementById(trigger.dataset.recipeTrigger);
      if (dialog) dialog.showModal();
    });
  });

  document.querySelectorAll('dialog.recipe-dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      const rect = dialog.getBoundingClientRect();
      const clickedInsideContent = (
        event.clientY >= rect.top && event.clientY <= rect.top + rect.height &&
        event.clientX >= rect.left && event.clientX <= rect.left + rect.width
      );
      if (!clickedInsideContent) dialog.close();
    });
  });
});
