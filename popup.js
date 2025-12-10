const status = document.querySelector('.status');
const output = document.getElementById('output');
const exportButton = document.getElementById('export');

function setStatus(text) {
  status.textContent = text;
}

function clearOutput() {
  output.value = '';
}

exportButton.addEventListener('click', () => {
  clearOutput();
  setStatus('Ready to fetch the question...');
});
