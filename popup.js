const statusEl = document.querySelector('.status');
const outputEl = document.getElementById('output');
const closeButton = document.getElementById('close-popup');
const tabButtons = Array.from(document.querySelectorAll('.tab'));
const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
const prefixInput = document.getElementById('question-prefix');
const separatorInput = document.getElementById('separator');
const correctPrefixInput = document.getElementById('correct-prefix');
const incorrectPrefixInput = document.getElementById('incorrect-prefix');

const DEFAULT_SETTINGS = {
  separator: '?',
  prefix: '### ',
  correctPrefix: '+',
  incorrectPrefix: '-'
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

function markdownSafe(value) {
  if (!value) return '';
  return String(value).replace(/[\\`*_\[\]]/g, '\\$&');
}

function buildMarkdown(question, answers, currentSettings = settings) {
  const normalizedPrefix = currentSettings?.prefix ?? DEFAULT_SETTINGS.prefix;
  const normalizedSeparator = currentSettings?.separator ?? DEFAULT_SETTINGS.separator;
  const normalizedCorrectPrefix = currentSettings?.correctPrefix ?? DEFAULT_SETTINGS.correctPrefix;
  const normalizedIncorrectPrefix = currentSettings?.incorrectPrefix ?? DEFAULT_SETTINGS.incorrectPrefix;
  const safeQuestion = markdownSafe(question);
  const normalizedAnswers = Array.isArray(answers) ? answers : [];
  const safeAnswers = normalizedAnswers
    .map((answer) => {
      const text = typeof answer === 'string' ? answer : answer?.text;
      const correct = typeof answer === 'object' && Boolean(answer?.correct);
      return {
        text: markdownSafe(text || ''),
        correct
      };
    })
    .filter((answer) => answer.text);

  const lines = safeAnswers.map((answer) => `${answer.correct ? normalizedCorrectPrefix : normalizedIncorrectPrefix} ${answer.text}`);
  return `${normalizedPrefix}${safeQuestion}
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
    separator: separatorInput.value ?? DEFAULT_SETTINGS.separator,
    correctPrefix: correctPrefixInput.value ?? DEFAULT_SETTINGS.correctPrefix,
    incorrectPrefix: incorrectPrefixInput.value ?? DEFAULT_SETTINGS.incorrectPrefix
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
      const getPaths = (root) => Array.from(root ? root.querySelectorAll('path') : []);
      const stripIndicators = (node) => {
        if (!node) return null;
        const clone = node.cloneNode(true);
        const indicatorSelectors = [
          '[data-functional-selector="open-ended-answer-count"]',
          '[class*="CorrectAnswerIndicator"]',
          '[data-functional-selector="icon"]'
        ];
        indicatorSelectors.forEach((selector) => {
          clone.querySelectorAll(selector).forEach((el) => el.remove());
        });
        return clone;
      };
      const normalizeD = (d) => (d || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const CHECK_PATH_PATTERN = /21\.9659.*13\.6554.*25\.8261/;
      const CROSS_PATH_PATTERNS = [
        /10\.1818 8.*13\.8182 16.*24 10\.1818/,
        /10\.1818 8.*8 10\.1818.*5\.8182 5\.8182/
      ];
      const isIndicatorNode = (node) => {
        if (!node) return false;
        const dfs = (node.getAttribute('data-functional-selector') || '').toLowerCase();
        const cls = (node.className || '').toString().toLowerCase();
        if (dfs.includes('answer-count')) return true;
        if (dfs.includes('correct-count')) return true;
        if (cls.includes('correctcount')) return true;
        if (cls.includes('correctanswerindicator')) return true;
        return false;
      };

      const hasCheckIcon = (node) => {
        const paths = getPaths(node);
        return paths.some((path) => {
          const d = normalizeD(path.getAttribute('d'));
          if (!d) return false;
          if (CHECK_PATH_PATTERN.test(d)) return true;
          return d.includes('24.1926') && d.includes('25.8261');
        });
      };

      const hasCrossIcon = (node) => {
        const paths = getPaths(node);
        return paths.some((path) => {
          const d = normalizeD(path.getAttribute('d'));
          if (!d) return false;
          return CROSS_PATH_PATTERNS.some((pattern) => pattern.test(d));
        });
      };

      const hasCorrectFlag = (node) => {
        if (!node) return false;
        const attr = (name) => (node.getAttribute(name) || '').toLowerCase();
        const className = (node.className || '').toString().toLowerCase();
        const ariaLabel = attr('aria-label');

        if (attr('data-result') === 'correct') return true;
        if (attr('data-correct') === 'true') return true;
        if (ariaLabel.includes('correct')) return true;
        if (className.includes('correct')) return true;
        return false;
      };

      const isCorrectAnswer = (node) => {
        if (!node) return false;
        if (hasCorrectFlag(node)) return true;
        if (hasCheckIcon(node)) return true;
        if (hasCrossIcon(node)) return false;

        const iconWrapper = node.querySelector('[class*="question-choice-content__IconWrapper"]');
        if (iconWrapper) {
          if (hasCheckIcon(iconWrapper)) return true;
          if (hasCrossIcon(iconWrapper)) return false;
        }

        const icon = node.querySelector('svg');
        if (icon) {
          if (hasCheckIcon(icon)) return true;
          if (hasCrossIcon(icon)) return false;
        }

        return false;
      };

      const questionEl =
        document.querySelector('[data-functional-selector="block-title"]') ||
        document.querySelector('[class*="question-title"]') ||
        document.querySelector('[role="heading"]');

      const choiceNodes = Array.from(
        document.querySelectorAll('[data-functional-selector^="answer-"], [data-functional-selector*="answer-"], [data-functional-selector*="answer"]')
      ).filter((node) => node.matches('button, div') && !isIndicatorNode(node));

      let answers = choiceNodes
        .map((node) => {
          const textTarget =
            node.querySelector('[data-functional-selector^="question-choice-text"] p') ||
            node.querySelector('[data-functional-selector^="question-choice-text"]') ||
            node.querySelector('p') ||
            node;
          const cleanedTextTarget = stripIndicators(textTarget) || textTarget;
          const disabled = node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true';
          return {
            text: getText(cleanedTextTarget),
            correct: isCorrectAnswer(node),
            disabled
          };
        })
        .filter((entry) => Boolean(entry.text));

      if (!answers.length) {
        const textNodes = Array.from(document.querySelectorAll('[data-functional-selector^="question-choice-text"]'));
        answers = textNodes
          .map((node) => {
            const container =
              node.closest('[data-functional-selector^="answer-"]') ||
              node.closest('[data-functional-selector*="answer-"]') ||
              node.closest('[data-functional-selector*="answer"]') ||
              node;
            if (isIndicatorNode(container) || isIndicatorNode(node)) {
              return null;
            }
            const textTarget = node.querySelector('p') || node;
            const cleanedTextTarget = stripIndicators(textTarget) || textTarget;
            const disabled = container.hasAttribute('disabled') || container.getAttribute('aria-disabled') === 'true';
            return {
              text: getText(cleanedTextTarget),
              correct: isCorrectAnswer(container),
              disabled
            };
          })
          .filter((entry) => entry && Boolean(entry.text));
      }

      if (!answers.some((answer) => answer.correct)) {
        const hasDisabled = answers.some((answer) => answer.disabled);
        const hasEnabled = answers.some((answer) => !answer.disabled);
        if (hasDisabled && hasEnabled) {
          answers = answers.map((answer) => ({
            ...answer,
            correct: !answer.disabled
          }));
        }
      }

      const dedupedMap = new Map();
      for (const answer of answers) {
        const key = answer.text.toLowerCase();
        const existing = dedupedMap.get(key);
        if (!existing) {
          dedupedMap.set(key, answer);
        } else if (answer.correct && !existing.correct) {
          dedupedMap.set(key, { ...existing, correct: true });
        }
      }

      return {
        question: getText(questionEl),
        answers: Array.from(dedupedMap.values())
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
  if (prefixInput && separatorInput && correctPrefixInput && incorrectPrefixInput) {
    prefixInput.value = settings.prefix;
    separatorInput.value = settings.separator;
    correctPrefixInput.value = settings.correctPrefix;
    incorrectPrefixInput.value = settings.incorrectPrefix;

    prefixInput.addEventListener('input', handleSettingChange);
    separatorInput.addEventListener('input', handleSettingChange);
    correctPrefixInput.addEventListener('input', handleSettingChange);
    incorrectPrefixInput.addEventListener('input', handleSettingChange);
  }

  runExport();
}

init();
