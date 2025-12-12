const statusEl = document.querySelector('.status');
const outputEl = document.getElementById('output');
const closeButton = document.getElementById('close-popup');
const tabButtons = Array.from(document.querySelectorAll('.tab'));
const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
const prefixInput = document.getElementById('question-prefix');
const separatorInput = document.getElementById('separator');

const DEFAULT_SETTINGS = {
  separator: '?',
  prefix: '### '
};

let settings = { ...DEFAULT_SETTINGS };
let lastExport = null;

function setStatus(text, type = 'info') {
  statusEl.textContent = text;
  statusEl.classList.remove('error', 'success');
  if (type === 'error') {
    statusEl.classList.add('error');
  } else if (type === 'success') {
    statusEl.classList.add('success');
  }
}

function activateTab(tabName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === `${tabName}-panel`);
  });
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

function buildMarkdown(question, answers, currentSettings = settings) {
  const normalizedPrefix = currentSettings?.prefix ?? DEFAULT_SETTINGS.prefix;
  const normalizedSeparator = currentSettings?.separator ?? DEFAULT_SETTINGS.separator;
  const lines = answers.map((answer) => `- ${answer}`);
  return `${normalizedPrefix}${question}
${normalizedSeparator}
${lines.join('\n')}
  
`;
}

function loadSettings() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.sync) {
      resolve({ ...DEFAULT_SETTINGS });
      return;
    }

    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to load settings', chrome.runtime.lastError);
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }

      resolve({ ...DEFAULT_SETTINGS, ...result });
    });
  });
}

function saveSettings(nextSettings) {
  return new Promise((resolve) => {
    if (!chrome?.storage?.sync) {
      resolve();
      return;
    }

    chrome.storage.sync.set(nextSettings, () => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to save settings', chrome.runtime.lastError);
      }
      resolve();
    });
  });
}

async function handleSettingChange() {
  settings = {
    prefix: prefixInput.value ?? DEFAULT_SETTINGS.prefix,
    separator: separatorInput.value ?? DEFAULT_SETTINGS.separator
  };

  await saveSettings(settings);

  if (lastExport) {
    outputEl.value = buildMarkdown(lastExport.question, lastExport.answers);
  }
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
  setStatus('Collecting question…');
  outputEl.value = '';
  lastExport = null;

  try {
    const { question, answers } = await fetchQuestionFromActiveTab();
    if (!question || !answers?.length) {
      throw new Error('Question or answers missing.');
    }

    lastExport = { question, answers };
    const markdown = buildMarkdown(question, answers);
    outputEl.value = markdown;
    const copied = await copyToClipboard(markdown);

    setStatus(copied ? 'Markdown copied to clipboard.' : 'Markdown ready. Copy it manually.', copied ? 'success' : 'info');
  } catch (error) {
    console.error(error);
    setStatus('Could not find a Kahoot question on this page.', 'error');
  }
}

async function init() {
  activateTab('export');

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;
      if (targetTab) {
        activateTab(targetTab);
      }
    });
  });

  if (closeButton) {
    closeButton.addEventListener('click', () => window.close());
  }

  settings = await loadSettings();
  if (prefixInput && separatorInput) {
    prefixInput.value = settings.prefix;
    separatorInput.value = settings.separator;

    prefixInput.addEventListener('input', handleSettingChange);
    separatorInput.addEventListener('input', handleSettingChange);
  }

  runExport();
}

init();
