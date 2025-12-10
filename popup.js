const statusEl = document.querySelector('.status');
const outputEl = document.getElementById('output');
const exportButton = document.getElementById('export');

function setStatus(text, type = 'info') {
  statusEl.textContent = text;
  statusEl.classList.remove('error', 'success');
  if (type === 'error') {
    statusEl.classList.add('error');
  } else if (type === 'success') {
    statusEl.classList.add('success');
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn('Clipboard write failed', error);
    return false;
  }
}

function buildMarkdown(question, answers) {
  const lines = answers.map((answer) => `- ${answer}`);
  return `### ${question}
?
${lines.join('\n')}
  
`;
}

async function fetchQuestionFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab detected.');
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const getText = (el) => (el?.innerText || '').trim();

      const questionEl =
        document.querySelector('[data-functional-selector="block-title"]') ||
        document.querySelector('[class*="question-title"]') ||
        document.querySelector('[role="heading"]');

      const choiceSelectors = [
        '[data-functional-selector^="question-choice-text"]',
        'button[data-functional-selector^="answer-"]',
        '[data-functional-selector*="answer"]'
      ];

      let answers = [];
      for (const selector of choiceSelectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        const extracted = nodes
          .map((node) => {
            const textTarget = node.querySelector('p') || node;
            return getText(textTarget);
          })
          .filter(Boolean);

        if (extracted.length) {
          answers = extracted;
          break;
        }
      }

      const deduped = [];
      const seen = new Set();
      for (const answer of answers) {
        const key = answer.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(answer);
      }

      return {
        question: getText(questionEl),
        answers: deduped
      };
    }
  });

  return result;
}

async function runExport() {
  exportButton.disabled = true;
  setStatus('Collecting question…');
  outputEl.value = '';

  try {
    const { question, answers } = await fetchQuestionFromActiveTab();
    if (!question || !answers?.length) {
      throw new Error('Question or answers missing.');
    }

    const markdown = buildMarkdown(question, answers);
    outputEl.value = markdown;
    const copied = await copyToClipboard(markdown);

    setStatus(copied ? 'Markdown copied to clipboard.' : 'Markdown ready. Copy it manually.', copied ? 'success' : 'info');
  } catch (error) {
    console.error(error);
    setStatus('Could not find a Kahoot question on this page.', 'error');
  } finally {
    exportButton.disabled = false;
  }
}

exportButton.addEventListener('click', runExport);

runExport();
