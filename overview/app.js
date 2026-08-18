const label = document.getElementById('tip-label');
const text = document.getElementById('tip-text');

document.querySelectorAll('.hero-network .node').forEach((node) => {
  const showNote = () => {
    label.textContent = node.dataset.label;
    text.textContent = node.dataset.text;
  };
  node.addEventListener('mouseenter', showNote);
  node.addEventListener('click', showNote);
});

const processTitle = document.getElementById('process-title');
const processCopy = document.getElementById('process-copy');
document.querySelectorAll('.process-step').forEach((step) => {
  const explain = () => {
    document.querySelectorAll('.process-step').forEach((item) => item.classList.remove('active'));
    step.classList.add('active');
    processTitle.textContent = step.dataset.title;
    processCopy.textContent = step.dataset.copy;
  };
  step.addEventListener('mouseenter', explain);
  step.addEventListener('focus', explain);
  step.addEventListener('click', explain);
});
