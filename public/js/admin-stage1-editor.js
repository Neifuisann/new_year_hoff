let editingId = null;
let editor = null;

document.addEventListener('DOMContentLoaded', async () => {
    const pathParts = window.location.pathname.split('/');
    editingId = null;

    if (pathParts.includes('edit')) {
        const idIndex = pathParts.indexOf('edit') + 1;
        if (idIndex < pathParts.length) {
            editingId = pathParts[idIndex];
        }
    }

    let initialTextContent = '';
    if (editingId) {
        try {
            const response = await fetch(`/api/lessons/${editingId}`);
            if (!response.ok) throw new Error('Failed to load lesson content');
            const lessonData = await response.json();
            initialTextContent = generateInitialText(lessonData.questions || []);
        } catch (error) {
            console.error("Error loading lesson content:", error);
            alert('Failed to load existing lesson content.');
        }
    }
    
    initializeEditor(initialTextContent);
});

function generateInitialText(questions) {
    let text = '';
    if (!Array.isArray(questions)) return '';

    questions.forEach((q, index) => {
        text += `Câu ${index + 1}: ${q.question || ''}\n`;

        if (q.points && q.points !== 1) {
             text += `[${q.points} pts]\n`;
        }

        if (q.type === 'abcd') {
            (q.options || []).forEach((opt, optIndex) => {
                const letter = String.fromCharCode(65 + optIndex);
                const isCorrect = String(q.correct).toLowerCase() === letter.toLowerCase();
                const prefix = isCorrect ? '*' : '';
                text += `${prefix}${letter}. ${opt.text || ''}\n`;
            });
        } else if (q.type === 'number') {
            text += `Answer: ${q.correct || ''}\n`;
        } else if (q.type === 'truefalse') {
            (q.options || []).forEach((opt, optIndex) => {
                const letter = String.fromCharCode(65 + optIndex);
                const isCorrect = Array.isArray(q.correct) ? q.correct[optIndex] : false;
                text += `${letter}. ${opt.text || ''} [${isCorrect ? 'True' : 'False'}]\n`;
            });
        }
        text += '\n';
    });
    return text.trim();
}

function initializeEditor(initialContent) {
    const textArea = document.getElementById('text-editor');
    if (!textArea) {
        console.error("Text editor element (#text-editor) not found!");
        return;
    }

    if (typeof CodeMirror === 'undefined') {
        console.error("CodeMirror library not found! Check CDN links in HTML.");
        textArea.value = "Error: CodeMirror failed to load.";
        textArea.style.color = 'red';
        textArea.style.backgroundColor = '#fee';
        return;
    }

    try {
        editor = CodeMirror.fromTextArea(textArea, {
            lineNumbers: true,
            mode: null,
            theme: 'default',
            lineWrapping: true,
            autofocus: true,
            extraKeys: {
                "Enter": function(cm) {
                    const cursor = cm.getCursor();
                    const lineContent = cm.getLine(cursor.line);
                    const trimmedLine = lineContent.trim();

                    const optionMatch = trimmedLine.match(/^(\*?)([A-Z])(\.)/i);
                    const questionMatch = trimmedLine.match(/^Câu\s*\d+\s*:/i);

                    let nextLinePrefix = '';

                    if (optionMatch) {
                        const currentLetter = optionMatch[2].toUpperCase();
                        if (currentLetter < 'D') {
                            nextLinePrefix = String.fromCharCode(currentLetter.charCodeAt(0) + 1) + '. ';
                        } else {
                            nextLinePrefix = '\n';
                        }
                    } else if (questionMatch) {
                        nextLinePrefix = 'A. ';
                    } else if (cursor.line > 0) {
                         const prevLineContent = cm.getLine(cursor.line - 1)?.trim();
                         if (prevLineContent?.match(/^(\*?)[A-D]\.\s*/i)) {
                              const prevOptionMatch = prevLineContent.match(/^(\*?)([A-Z])\.\s*/i);
                              if (prevOptionMatch) {
                                  const prevLetter = prevOptionMatch[2].toUpperCase();
                                   if (prevLetter < 'D') {
                                       nextLinePrefix = String.fromCharCode(prevLetter.charCodeAt(0) + 1) + '. ';
                                   } else {
                                        nextLinePrefix = '\n';
                                   }
                              }
                         } else if (prevLineContent?.match(/^Câu\s*\d+\s*:/i) || prevLineContent?.match(/^\[\d+\s*pts?\s*\]$/i)) {
                             nextLinePrefix = 'A. ';
                         }
                    }

                    cm.replaceSelection('\n' + nextLinePrefix);

                },
                "Shift-Enter": function(cm) {
                    cm.replaceSelection('\n');
                },
                "Tab": function(cm) {
                     cm.replaceSelection("  ");
                }
            }
        });

        editor.setValue(initialContent || '');

        let debounceTimer;
        editor.on('change', (cm, change) => {
            clearTimeout(debounceTimer);
            if (change.origin !== 'setValue' && change.origin !== 'paste' && change.origin !== 'undo' && change.origin !== 'redo' && change.origin !== '+input') {
            }
            debounceTimer = setTimeout(() => {
                const currentText = cm.getValue();
                const parsed = parseQuizText(currentText);
                updatePreview(parsed);
                applySyntaxHighlighting(cm);
            }, 300);
        });

        const initialParsed = parseQuizText(initialContent);
        updatePreview(initialParsed);
        applySyntaxHighlighting(editor);

        setTimeout(() => {
             if (editor) editor.refresh();
        }, 150);

    } catch (err) {
        console.error("Error initializing CodeMirror:", err);
        textArea.value = `Error initializing CodeMirror: ${err.message}`;
        textArea.style.color = 'red';
        textArea.style.backgroundColor = '#fee';
    }
}

function parseQuizText(text) {
    const questions = [];
    const lines = text.split('\n');
    let currentQ = null;
    let currentLineIndex = -1;

    const questionRegex = /^Câu\s*(\d+)\s*:\s*(.*)/i;
    const optionRegex = /^([A-Z])\.\s*(.*)/i;
    const answerRegex = /^\*([A-Z])\./i;
    const numberAnswerRegex = /^Answer:\s*(.*)/i;
    const pointsRegex = /^\[(\s*(\d+)\s*pts?\s*)\]$/i;

    lines.forEach((line, index) => {
        currentLineIndex = index;
        const trimmedLine = line.trim();

        let match = line.match(questionRegex);
        if (match) {
            if (currentQ) questions.push(currentQ);
            currentQ = {
                question: match[2].trim(),
                options: [],
                correct: '',
                points: 1,
                type: 'abcd',
                startLine: currentLineIndex
            };
            return;
        }

        if (!currentQ) return;

        match = trimmedLine.match(pointsRegex);
        if (match) {
            currentQ.points = parseInt(match[2]) || 1;
            return;
        }

        match = line.match(answerRegex);
        if (match) {
            currentQ.correct = match[1].toLowerCase();
            line = line.substring(1);
        }

        match = line.match(optionRegex);
        if (match) {
            if (currentQ.type === 'abcd' || currentQ.type === 'truefalse') {
                 currentQ.options.push({ text: match[2].trim(), line: currentLineIndex });
            }
            return;
        }
        
        match = trimmedLine.match(numberAnswerRegex);
        if (match) {
            currentQ.type = 'number';
            currentQ.correct = match[1].trim();
            currentQ.options = [];
            return;
        }

        if (!trimmedLine.match(questionRegex) && !trimmedLine.match(pointsRegex) && !trimmedLine.match(optionRegex) && !trimmedLine.match(numberAnswerRegex)) {
            if (currentQ.options.length > 0) {
                const lastOption = currentQ.options[currentQ.options.length - 1];
                lastOption.text += '\n' + line;
            } else if (currentQ.question) {
                 currentQ.question += '\n' + line;
            }
        }
    });

    if (currentQ) questions.push(currentQ);

    questions.forEach((q, index) => {
        q.id = `q_${index + 1}`;
        q.options = q.options.map(opt => opt.text ? opt : { text: opt, line: -1 });
        
        if (q.options.length === 0 && q.type !== 'number') {
             console.warn(`Question ${index + 1} has no options and is not type 'number'. Marking as invalid.`);
             q.type = 'invalid';
        } else if (q.type === 'abcd' && q.options.length !== 4) {
             console.warn(`Question ${index + 1} is type 'abcd' but has ${q.options.length} options. Padding/cropping to 4.`);
             while (q.options.length < 4) q.options.push({ text: '', line: -1 });
             q.options = q.options.slice(0, 4);
        } else if (q.type === 'abcd' && !q.correct) {
            console.warn(`Question ${index + 1} is type 'abcd' but missing correct answer marker '*'`);
        }
    });
    
    return questions;
}

function updatePreview(parsedQuestions) {
    const previewContainer = document.getElementById('realtime-preview');
    if (!previewContainer) return;

    previewContainer.innerHTML = '';

    if (!parsedQuestions || parsedQuestions.length === 0) {
        previewContainer.innerHTML = '<p data-i18n="previewPlaceholder">Enter questions in the editor...</p>';
        return;
    }

    parsedQuestions.forEach((q, index) => {
        const questionIndex = index;
        const questionElement = document.createElement('div');
        questionElement.className = `preview-question ${q.type === 'invalid' ? 'invalid' : ''}`;
        questionElement.onclick = () => scrollToQuestion(questionIndex);
        questionElement.style.cursor = 'pointer';

        if (q.type === 'invalid') {
            questionElement.textContent = 'Invalid Question Format';
            previewContainer.appendChild(questionElement);
            return;
        };

        const questionHtml = q.question.replace(/\[img\s+src="([^\"]*)"\]/gi, '<img src="$1" alt="Question Image" class="preview-image">');

        let contentHTML = `<div class="preview-question-header"><span class="q-number">Câu ${index + 1}:</span><span class="q-text">${questionHtml.replace(/\n/g, '<br>')}</span></div>`;

        if (q.type === 'abcd' && q.options.length > 0) {
            contentHTML += `<ul class="preview-options">`;
            q.options.forEach((opt, optIndex) => {
                const letter = String.fromCharCode(65 + optIndex);
                const isCorrect = String(q.correct).toLowerCase() === letter.toLowerCase();
                const optionTextHtml = (opt.text || '').replace(/\[img\s+src="([^\"]*)"\]/gi, '<img src="$1" alt="Option Image" class="preview-image">').replace(/\n/g, '<br>');
                
                contentHTML += `<li class="${isCorrect ? 'correct' : ''}" onclick="event.stopPropagation(); markAnswerCorrect(${questionIndex}, ${optIndex});" style="cursor: pointer;" title="Click to mark as correct">\n                                    <span class="option-letter">${letter}.</span> \n                                    <span class="option-text">${optionTextHtml}</span>\n                                </li>`;
            });
            contentHTML += `</ul>`;
        } else if (q.type === 'number') {
             contentHTML += `<div class="preview-answer">Answer: <span>${q.correct}</span></div>`;
        } else if (q.type === 'truefalse') {
             contentHTML += `<p>(True/False preview not yet implemented)</p>`;
        }
        
        if (q.points > 1) {
             contentHTML += `<div class="preview-points">[${q.points} pts]</div>`;
        }

        questionElement.innerHTML = contentHTML;
        previewContainer.appendChild(questionElement);
    });

    if (typeof renderMathInElement === 'function') {
        renderMathInElement(previewContainer, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false},
                {left: "\\(", right: "\\)", display: false},
                {left: "\\[", right: "\\]", display: true}
            ],
            throwOnError: false
        });
    }
}

function applySyntaxHighlighting(cm) {
    if (!cm) return;
    cm.operation(() => {
        for (let i = 0; i < cm.lineCount(); i++) {
            const marks = cm.findMarks({ line: i, ch: 0 }, { line: i, ch: cm.getLine(i).length });
            marks.forEach(mark => mark.clear());

            const lineText = cm.getLine(i);

            let match = lineText.match(/^(Câu\s*\d+)(:)/i);
            if (match) {
                cm.markText({ line: i, ch: 0 }, { line: i, ch: match[1].length }, { className: 'cm-question-number' });
                cm.markText({ line: i, ch: match[1].length }, { line: i, ch: match[1].length + 1 }, { className: 'cm-question-colon' });
            }

            match = lineText.match(/^(\*?)([A-Z])(\.)/i);
             if (match) {
                  let start = 0;
                  if (match[1]) {
                      cm.markText({ line: i, ch: 0 }, { line: i, ch: 1 }, { className: 'cm-correct-marker' });
                      start = 1;
                  }
                 cm.markText({ line: i, ch: start }, { line: i, ch: start + 1 }, { className: 'cm-option-letter' });
                 cm.markText({ line: i, ch: start + 1 }, { line: i, ch: start + 2 }, { className: 'cm-option-dot' });
             }

             match = lineText.match(/(\[\s*\d+\s*pts?\s*\])/i);
             if (match) {
                 const startIndex = lineText.indexOf(match[1]);
                 cm.markText({ line: i, ch: startIndex }, { line: i, ch: startIndex + match[1].length }, { className: 'cm-points-marker' });
             }

             match = lineText.match(/^(Answer:)/i);
             if (match) {
                 cm.markText({ line: i, ch: 0 }, { line: i, ch: match[1].length }, { className: 'cm-answer-prefix' });
             }
        }
    });
}

function proceedToConfiguration() {
    if (!editor) {
        alert('Editor not initialized.');
        return;
    }
    
    const lessonText = editor.getValue();
    const parsedQuestions = parseQuizText(lessonText);

    if (parsedQuestions.length === 0) {
        if (!confirm("There are no questions. Proceed to configuration anyway?")) {
            return;
        }
    }
    if (parsedQuestions.some(q => q.type === 'invalid')) {
        alert('Some questions could not be parsed correctly. Please fix them before proceeding.');
        return;
    }

    try {
        const stage1Data = {
            questions: parsedQuestions,
            editingId: editingId
        };
        sessionStorage.setItem('lessonStage1Data', JSON.stringify(stage1Data));
        
        const configureUrl = editingId ? `/admin/configure/${editingId}` : '/admin/configure';
        window.location.href = configureUrl;

    } catch (error) {
        console.error("Error storing data for Stage 2:", error);
        alert('Could not proceed to configuration. Check console for details.');
        sessionStorage.removeItem('lessonStage1Data');
    }
}

function findQuestionLine(questionIndex) {
    if (!editor) return -1;
    const text = editor.getValue();
    const parsedQuestions = parseQuizText(text);
    if (questionIndex >= 0 && questionIndex < parsedQuestions.length) {
        return parsedQuestions[questionIndex].startLine !== undefined ? parsedQuestions[questionIndex].startLine : -1;
    }
    return -1;
}

function scrollToQuestion(questionIndex) {
    if (!editor) return;
    const line = findQuestionLine(questionIndex);
    if (line !== -1) {
        editor.scrollIntoView({ line: line, ch: 0 }, 50);
        editor.setCursor({ line: line, ch: 0 });
        editor.focus();
    } else {
        console.warn(`Could not find line for question index ${questionIndex}`);
    }
}

function markAnswerCorrect(questionIndex, optionIndex) {
    if (!editor) return;
    const text = editor.getValue();
    const lines = text.split('\n');
    const parsedQuestions = parseQuizText(text);

    if (questionIndex < 0 || questionIndex >= parsedQuestions.length) return;
    
    const question = parsedQuestions[questionIndex];
    if (question.type !== 'abcd' || optionIndex < 0 || optionIndex >= question.options.length) return;

    const targetOptionLetter = String.fromCharCode(65 + optionIndex);
    const targetOptionLineNum = question.options[optionIndex].line;

    if (targetOptionLineNum === -1 || targetOptionLineNum === undefined) {
        console.error("Could not find line number for the selected option.");
        return; 
    }

    editor.operation(() => {
        question.options.forEach((opt, idx) => {
             if (opt.line !== -1) {
                 const lineContent = editor.getLine(opt.line);
                 if (lineContent?.startsWith('*')) {
                     editor.replaceRange("", { line: opt.line, ch: 0 }, { line: opt.line, ch: 1 });
                 }
             }
        });

        const currentLine = editor.getLine(targetOptionLineNum);
        if (currentLine && !currentLine.startsWith('*')) {
             editor.replaceRange("*", { line: targetOptionLineNum, ch: 0 });
        }
    });
    
    const updatedText = editor.getValue();
    const updatedParsed = parseQuizText(updatedText);
    updatePreview(updatedParsed);
    applySyntaxHighlighting(editor);
}

function insertImagePlaceholder() {
    if (!editor) return;
    const placeholder = '[img src="PASTE_IMAGE_URL_HERE"]';
    editor.replaceSelection(placeholder);
    editor.focus();
}

function insertLatexDelimiters(delimiter) {
    if (!editor) return;
    const selection = editor.getSelection();
    if (selection) {
        editor.replaceSelection(delimiter + selection + delimiter);
    } else {
        editor.replaceSelection(delimiter + delimiter);
        const cur = editor.getCursor();
        editor.setCursor({ line: cur.line, ch: cur.ch - delimiter.length });
    }
    editor.focus();
}