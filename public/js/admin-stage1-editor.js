let editingId = null;
let editor = null;

// Main document ready handler
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOMContentLoaded event fired");
    
    // Initialize editor from existing content
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
    
    // Setup file input for image uploads
    const fileInput = document.getElementById('image-upload-input');
    if (fileInput) {
        console.log("File input element found, adding change listener");
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                console.log("File selected:", file.name);
                uploadImage(file, null); // Call upload function with the selected file
            }
        });
    } else {
        console.warn("Image upload input element not found");
    }
    
    // Add debug utility for syncing editor
    const syncButton = document.createElement('button');
    syncButton.textContent = "Debug: Sync Editor";
    syncButton.style.position = "fixed";
    syncButton.style.bottom = "10px";
    syncButton.style.right = "10px";
    syncButton.style.zIndex = "9999";
    syncButton.style.padding = "5px";
    syncButton.style.fontSize = "10px";
    syncButton.style.opacity = "0.5";
    syncButton.onclick = function() {
        if (editor) {
            console.log("Manually syncing editor to textarea");
            editor.save(); // Save editor content to the original textarea
            const currentText = editor.getValue();
            console.log("Current editor text:", currentText);
            alert("Editor synced to textarea");
        }
    };
    document.body.appendChild(syncButton);
    
    // Ensure Next button correctly saves editor content
    const nextButton = document.querySelector('.next-btn');
    if (nextButton) {
        // Replace any existing onclick handler to make sure the editor is saved first
        nextButton.onclick = function(event) {
            event.preventDefault(); // Prevent default action
            console.log("Next button clicked, ensuring editor content is saved");
            if (editor) {
                editor.save(); // Force the editor to save to the textarea
            }
            // Then proceed to configuration
            proceedToConfiguration();
        };
    }
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
                const optText = typeof opt === 'string' ? opt : (opt.text || '');
                const isCorrect = String(q.correct || '').toLowerCase() === letter.toLowerCase();
                const prefix = isCorrect ? '*' : '';
                text += `${prefix}${letter}. ${optText}\n`;
            });
        } else if (q.type === 'number') {
            text += `Answer: ${q.correct || ''}\n`;
        } else if (q.type === 'truefalse') {
            if (Array.isArray(q.correct)) {
                (q.options || []).forEach((opt, optIndex) => {
                    const letter = String.fromCharCode(97 + optIndex);
                    const optText = typeof opt === 'string' ? opt : (opt.text || '');
                    const isCorrect = q.correct[optIndex] === true;
                    const prefix = isCorrect ? '*' : '';
                    text += `${prefix}${letter}) ${optText}\n`;
                });
            } else {
                 console.warn(`Question ${index+1} is true/false but 'correct' is not an array. Outputting basic options.`);
                 (q.options || []).forEach((opt, optIndex) => {
                    const letter = String.fromCharCode(97 + optIndex);
                    const optText = typeof opt === 'string' ? opt : (opt.text || '');
                    text += `${letter}) ${optText}\n`;
                 });
            }
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

                    const abcdOptionMatch = trimmedLine.match(/^(\*?)([A-Z])(\.)/i);
                    const trueFalseOptionMatch = trimmedLine.match(/^(\*?)([a-z])(\))/i);
                    const questionMatch = trimmedLine.match(/^Câu\s*\d+\s*:/i);

                    let nextLinePrefix = '';

                    if (abcdOptionMatch) {
                        const currentLetter = abcdOptionMatch[2].toUpperCase();
                        if (currentLetter < 'D') {
                            nextLinePrefix = String.fromCharCode(currentLetter.charCodeAt(0) + 1) + '. ';
                        } else {
                            nextLinePrefix = '\n';
                        }
                    } else if (trueFalseOptionMatch) {
                        const currentLetter = trueFalseOptionMatch[2].toLowerCase();
                        nextLinePrefix = String.fromCharCode(currentLetter.charCodeAt(0) + 1) + ') ';
                    } else if (questionMatch) {
                        nextLinePrefix = 'A. ';
                    } else if (cursor.line > 0) {
                         const prevLineContent = cm.getLine(cursor.line - 1)?.trim();
                         if (prevLineContent) {
                             const prevAbcdMatch = prevLineContent.match(/^(\*?)([A-Z])\.\s*/i);
                             const prevTrueFalseMatch = prevLineContent.match(/^(\*?)([a-z])\)\s*/i);
                             const prevQuestionMatch = prevLineContent.match(/^Câu\s*\d+\s*:/i);
                             const prevPointsMatch = prevLineContent.match(/^\[\d+\s*pts?\s*\]$/i);

                             if (prevAbcdMatch) {
                                 const prevLetter = prevAbcdMatch[2].toUpperCase();
                                 if (prevLetter < 'D') {
                                     nextLinePrefix = String.fromCharCode(prevLetter.charCodeAt(0) + 1) + '. ';
                                 } else {
                                     nextLinePrefix = '\n';
                                 }
                             } else if (prevTrueFalseMatch) {
                                 const prevLetter = prevTrueFalseMatch[2].toLowerCase();
                                 nextLinePrefix = String.fromCharCode(prevLetter.charCodeAt(0) + 1) + ') ';
                             } else if (prevQuestionMatch || prevPointsMatch) {
                                 nextLinePrefix = 'A. ';
                             }
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
    let questionTypeDetermined = false;

    const questionRegex = /^Câu\s*(\d+)\s*:\s*(.*)/i;
    const pointsRegex = /^\[(\s*(\d+)\s*pts?\s*)\]$/i;
    const numberAnswerRegex = /^Answer:\s*(.*)/i;
    const abcdOptionRegex = /^(\*?)([A-Z])\.\s*(.*)/i;
    const trueFalseOptionRegex = /^(\*?)([a-z])\)\s*(.*)/i;

    lines.forEach((line, index) => {
        currentLineIndex = index;
        const trimmedLine = line.trim();

        let match = line.match(questionRegex);
        if (match) {
            if (currentQ) questions.push(currentQ);
            currentQ = {
                question: match[2].trim(),
                options: [],
                correct: null,
                points: 1,
                type: null,
                startLine: currentLineIndex
            };
            questionTypeDetermined = false;
            return;
        }

        if (!currentQ) return;

        match = trimmedLine.match(pointsRegex);
        if (match) {
            currentQ.points = parseInt(match[2]) || 1;
            return;
        }

        match = trimmedLine.match(numberAnswerRegex);
        if (match) {
            if (!questionTypeDetermined) {
                currentQ.type = 'number';
                currentQ.correct = match[1].trim();
                currentQ.options = [];
                questionTypeDetermined = true;
            } else if (currentQ.type !== 'number') {
                 console.warn(`Line ${index + 1}: Found 'Answer:' in a non-number question. Ignoring.`);
            }
            return;
        }

        match = line.match(abcdOptionRegex);
        if (match) {
            const isCorrectMarker = match[1] === '*';
            const letter = match[2];
            const optionText = match[3].trim();

            if (!questionTypeDetermined) {
                currentQ.type = 'abcd';
                currentQ.correct = '';
                questionTypeDetermined = true;
            }

            if (currentQ.type === 'abcd') {
                 currentQ.options.push({ text: optionText, line: currentLineIndex });
                 if (isCorrectMarker) {
                     if (currentQ.correct) {
                         console.warn(`Line ${index + 1}: Multiple correct answers marked for ABCD question. Using first: '${currentQ.correct}'. Ignoring '${letter}'.`);
                     } else {
                        currentQ.correct = letter;
                     }
                 }
            } else {
                 console.warn(`Line ${index + 1}: Found ABCD option format 'A.' in a non-ABCD question. Ignoring.`);
            }
            return;
        }

        match = line.match(trueFalseOptionRegex);
        if (match) {
            const isCorrectMarker = match[1] === '*';
            const letter = match[2];
            const optionText = match[3].trim();

            if (!questionTypeDetermined) {
                 currentQ.type = 'truefalse';
                 currentQ.correct = [];
                 questionTypeDetermined = true;
            }

            if (currentQ.type === 'truefalse') {
                 currentQ.options.push({ text: optionText, line: currentLineIndex });
                 if (!Array.isArray(currentQ.correct)) {
                     console.error(`Line ${index + 1}: Internal error - correct should be an array for true/false. Resetting.`);
                     currentQ.correct = [];
                 }
                 currentQ.correct[currentQ.options.length - 1] = isCorrectMarker;
            } else {
                 console.warn(`Line ${index + 1}: Found true/false option format 'a)' in a non-true/false question. Ignoring.`);
            }
            return;
        }

        if (currentQ && questionTypeDetermined && trimmedLine && !line.match(questionRegex) && !trimmedLine.match(pointsRegex) && !line.match(abcdOptionRegex) && !line.match(trueFalseOptionRegex) && !trimmedLine.match(numberAnswerRegex)) {
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
        q.options = q.options.map(opt => {
            if (typeof opt === 'string') {
                return { text: opt, line: -1 };
            } else if (typeof opt === 'object' && opt !== null) {
                return { text: opt.text || '', line: opt.line || -1 };
            } else {
                return { text: '', line: -1 };
            }
        });
        
        if (q.type === null && q.options.length === 0 && q.correct === null) {
             console.warn(`Question ${index + 1} could not be parsed (no type, options, or answer detected). Marking as invalid.`);
             q.type = 'invalid';
        } else if (q.type === 'abcd') {
             if (!q.correct) {
                 console.warn(`Question ${index + 1} (ABCD) has no correct answer marked with '*'.`);
             }
             q.correct = q.correct ? String(q.correct).toUpperCase() : '';
        } else if (q.type === 'truefalse') {
             if (!Array.isArray(q.correct)) {
                  console.warn(`Question ${index + 1} (True/False) has invalid 'correct' property (not an array). Resetting.`);
                  q.correct = new Array(q.options.length).fill(false);
             } else if (q.correct.length !== q.options.length) {
                 console.warn(`Question ${index + 1} (True/False) has mismatch between options (${q.options.length}) and correct answers (${q.correct.length}). Padding/truncating 'correct' array.`);
                 const correctedArray = new Array(q.options.length).fill(false);
                 for(let i = 0; i < Math.min(q.options.length, q.correct.length); i++) {
                     correctedArray[i] = q.correct[i];
                 }
                 q.correct = correctedArray;
             }
             q.correct = q.correct.map(c => !!c);
        } else if (q.type === 'number') {
             if (q.correct === null || q.correct === '') {
                 console.warn(`Question ${index + 1} (Number) is missing its answer.`);
             }
             q.correct = String(q.correct || '');
        }

        if (q.options.length === 0 && q.type !== 'number') {
             console.warn(`Question ${index + 1} has no options and is not type 'number'. Marking as invalid.`);
             q.type = 'invalid';
        } else if (q.type === 'abcd' && q.options.length !== 4) {
             console.warn(`Question ${index + 1} is type 'abcd' but has ${q.options.length} options. Padding/cropping to 4.`);
             while (q.options.length < 4) q.options.push({ text: '', line: -1 });
             q.options = q.options.slice(0, 4);
        }
    });
    
    return questions;
}

function updatePreview(parsedQuestions) {
    const previewContainer = document.getElementById('realtime-preview');
    if (!previewContainer) return;

    previewContainer.innerHTML = '';

    if (!parsedQuestions || parsedQuestions.length === 0) {
        previewContainer.innerHTML = '<p>Enter questions in the editor...</p>';
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
            contentHTML += `<ul class="preview-options abcd">`;
            q.options.forEach((opt, optIndex) => {
                const letter = String.fromCharCode(65 + optIndex);
                const isCorrect = String(q.correct).toUpperCase() === letter.toUpperCase();
                const optionText = opt.text || '';
                const optionTextHtml = optionText.replace(/\[img\s+src="([^\"]*)"\]/gi, '<img src="$1" alt="Option Image" class="preview-image">').replace(/\n/g, '<br>');

                contentHTML += `<li class="${isCorrect ? 'correct' : ''}" onclick="event.stopPropagation(); markAnswerCorrect(${questionIndex}, ${optIndex});" style="cursor: pointer;" title="Click to mark as correct">\n                                    <span class="option-letter">${letter}.</span> \n                                    <span class="option-text">${optionTextHtml}</span>\n                                </li>`;
            });
            contentHTML += `</ul>`;
        } else if (q.type === 'number') {
             contentHTML += `<div class="preview-answer">Answer: <span>${q.correct}</span></div>`;
        } else if (q.type === 'truefalse') {
             contentHTML += `<ul class="preview-options truefalse">`;
             if (Array.isArray(q.correct) && q.options.length === q.correct.length) {
                 q.options.forEach((opt, optIndex) => {
                     const letter = String.fromCharCode(97 + optIndex);
                     const isCorrect = q.correct[optIndex] === true;
                     const optionText = opt.text || '';
                     const optionTextHtml = optionText.replace(/\[img\s+src="([^\"]*)"\]/gi, '<img src="$1" alt="Option Image" class="preview-image">').replace(/\n/g, '<br>');

                     contentHTML += `<li class="${isCorrect ? 'correct' : ''}" onclick="event.stopPropagation(); markTrueFalseCorrect(${questionIndex}, ${optIndex});" style="cursor: pointer;" title="Click to toggle correctness">\n                                        <span class="option-letter">${letter})</span> \n                                        <span class="option-text">${optionTextHtml}</span>\n                                     </li>`;
                 });
             } else {
                  contentHTML += `<li>Error: Options and correct answers mismatch.</li>`;
                  console.error(`Preview Error: Question ${index+1} (True/False) options/correct mismatch`, q);
             }
             contentHTML += `</ul>`;
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
            const trimmedLine = lineText.trim();

            let match = lineText.match(/^(Câu\s*\d+)(:)/i);
            if (match) {
                cm.markText({ line: i, ch: 0 }, { line: i, ch: match[1].length }, { className: 'cm-question-number' });
                cm.markText({ line: i, ch: match[1].length }, { line: i, ch: match[1].length + 1 }, { className: 'cm-question-colon' });
                continue;
            }

            match = lineText.match(/^(\s*)(\*?)([A-Z])(\.)/i);
             if (match) {
                  const leadingSpace = match[1].length;
                  let start = leadingSpace;
                  if (match[2]) {
                      cm.markText({ line: i, ch: start }, { line: i, ch: start + 1 }, { className: 'cm-correct-marker' });
                      start += 1;
                  }
                 cm.markText({ line: i, ch: start }, { line: i, ch: start + 1 }, { className: 'cm-option-letter' });
                 cm.markText({ line: i, ch: start + 1 }, { line: i, ch: start + 2 }, { className: 'cm-option-dot' });
                 continue;
             }

             match = lineText.match(/^(\s*)(\*?)([a-z])(\))/i);
             if (match) {
                  const leadingSpace = match[1].length;
                  let start = leadingSpace;
                  if (match[2]) {
                      cm.markText({ line: i, ch: start }, { line: i, ch: start + 1 }, { className: 'cm-correct-marker' });
                      start += 1;
                  }
                 cm.markText({ line: i, ch: start }, { line: i, ch: start + 1 }, { className: 'cm-tf-option-letter' });
                 cm.markText({ line: i, ch: start + 1 }, { line: i, ch: start + 2 }, { className: 'cm-tf-option-paren' });
                 continue;
             }

             match = lineText.match(/(\[\s*\d+\s*pts?\s*\])/i);
             if (match && trimmedLine.match(/^\[\s*\d+\s*pts?\s*\]$/i)) {
                 const leadingSpace = match[1].length;
                 cm.markText({ line: i, ch: leadingSpace }, { line: i, ch: leadingSpace + match[2].length }, { className: 'cm-points-marker' });
                 continue;
             }

             match = lineText.match(/^(\s*)(Answer:)/i);
             if (match) {
                 const leadingSpace = match[1].length;
                 cm.markText({ line: i, ch: leadingSpace }, { line: i, ch: leadingSpace + match[2].length }, { className: 'cm-answer-prefix' });
             }
        }
    });
}

// If sessionStorage fails, try to use direct API saving
async function saveRawContentToServer() {
    if (!editor) {
        console.error("Editor not initialized, cannot save raw content");
        return false;
    }
    
    try {
        // Force editor to save to textarea
        editor.save(); 
        
        // Get the editor content
        const rawContent = editor.getValue();
        
        // Create a temporary lesson ID if we don't have one
        const tempId = editingId || ('temp_' + Date.now());
        
        // Send the raw content to the server
        const response = await fetch('/api/admin/save-raw-lesson', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: tempId,
                rawContent: rawContent
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            console.log("Raw content saved successfully with ID:", result.id);
            // Store this ID in both sessionStorage and localStorage
            sessionStorage.setItem('rawContentId', result.id);
            localStorage.setItem('rawContentId', result.id);
            return result.id;
        } else {
            throw new Error(result.error || "Unknown error saving raw content");
        }
    } catch (error) {
        console.error("Error saving raw content:", error);
        return false;
    }
}

function proceedToConfiguration() {
    if (!editor) {
        alert('Editor not initialized.');
        return;
    }
    
    try {
        // CRITICAL: Make sure we're getting the most current content from the editor
        editor.save(); // Force editor to update the underlying textarea
        
        // Get the newest content from the editor
        const lessonText = editor.getValue();
        
        // Log the raw text for debugging
        console.log("Raw editor content being processed:");
        console.log(lessonText);
        
        const parsedQuestions = parseQuizText(lessonText);
    
        // --- DEBUGGING: Log the parsed questions before storing --- 
        console.log("Parsed Questions (Stage 1):");
        console.log(JSON.stringify(parsedQuestions, null, 2)); 
        // --- END DEBUGGING ---
    
        if (parsedQuestions.length === 0) {
            if (!confirm("There are no questions. Proceed to configuration anyway?")) {
                return;
            }
        }
        if (parsedQuestions.some(q => q.type === 'invalid')) {
            alert('Some questions could not be parsed correctly. Please fix them before proceeding.');
            return;
        }
    
        const stage1Data = {
            questions: parsedQuestions,
            editingId: editingId,
            rawText: lessonText // Store the raw text as well for safety
        };
        
        // --- DEBUGGING: Log the data being stored --- 
        console.log("Storing in sessionStorage (lessonStage1Data):");
        console.log(JSON.stringify(stage1Data, null, 2));
        // --- END DEBUGGING ---
        
        // Store in sessionStorage
        sessionStorage.setItem('lessonStage1Data', JSON.stringify(stage1Data));
        
        // Add a backup using localStorage as well (in case sessionStorage fails)
        try {
            localStorage.setItem('lessonStage1Data_backup', JSON.stringify(stage1Data));
            console.log("Backup stored in localStorage");
        } catch (storageError) {
            console.warn("Could not store backup in localStorage:", storageError);
        }
        
        // Verify the data was stored correctly
        const storedData = sessionStorage.getItem('lessonStage1Data');
        if (!storedData) {
            console.error("Failed to retrieve data from sessionStorage immediately after storing!");
            alert("Warning: There may be an issue with your browser's sessionStorage. Trying an alternative approach.");
            
            // Try to save raw content directly to server
            console.log("Attempting to save raw content to server...");
            saveRawContentToServer().then(savedId => {
                if (savedId) {
                    console.log("Raw content saved with ID:", savedId);
                    alert("Your content has been saved to the server. You will be redirected to the configuration page.");
                    const configureUrl = savedId ? `/admin/configure/${savedId}` : '/admin/configure';
                    window.location.href = configureUrl;
                } else {
                    alert("Failed to save your content. Please try again or contact support.");
                }
            });
            return; // Don't proceed until the save operation completes
        }
        
        const configureUrl = editingId ? `/admin/configure/${editingId}` : '/admin/configure';
        
        // Use a small delay before redirecting to ensure storage is complete
        console.log("Redirecting to " + configureUrl + " in 100ms...");
        setTimeout(() => {
            window.location.href = configureUrl;
        }, 100);
        
    } catch (error) {
        console.error("Error storing data for Stage 2:", error);
        alert('Could not proceed to configuration: ' + error.message);
        // Don't remove the session storage if there's an error - we might want to inspect it
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
        console.error("Could not find line number for the selected ABCD option.");
        return;
    }

    editor.operation(() => {
        question.options.forEach((opt, idx) => {
             if (opt.line !== -1 && opt.line !== undefined) {
                 const lineContent = editor.getLine(opt.line);
                 if (lineContent?.trim().startsWith('*')) {
                     const starPos = lineContent.indexOf('*');
                     if (starPos !== -1) {
                         editor.replaceRange("", { line: opt.line, ch: starPos }, { line: opt.line, ch: starPos + 1 });
                     }
                 }
             }
        });

        const currentLine = editor.getLine(targetOptionLineNum);
        if (currentLine && !currentLine.trim().startsWith('*')) {
            const insertPos = currentLine.search(/\S|$/);
             editor.replaceRange("*", { line: targetOptionLineNum, ch: insertPos });
        }
    });
    
    const updatedText = editor.getValue();
    const updatedParsed = parseQuizText(updatedText);
    updatePreview(updatedParsed);
    applySyntaxHighlighting(editor);
}

function markTrueFalseCorrect(questionIndex, optionIndex) {
    if (!editor) return;
    const text = editor.getValue();
    const lines = text.split('\n');
    const parsedQuestions = parseQuizText(text);

    if (questionIndex < 0 || questionIndex >= parsedQuestions.length) return;

    const question = parsedQuestions[questionIndex];
    if (question.type !== 'truefalse' || optionIndex < 0 || optionIndex >= question.options.length) return;

    const targetOptionLineNum = question.options[optionIndex].line;

    if (targetOptionLineNum === -1 || targetOptionLineNum === undefined) {
        console.error("Could not find line number for the selected True/False option.");
        return;
    }

    editor.operation(() => {
        const currentLine = editor.getLine(targetOptionLineNum);
        if (!currentLine) return;

        const trimmedLine = currentLine.trim();
        const insertPos = currentLine.search(/\S|$/);

        if (trimmedLine.startsWith('*')) {
            const starPos = currentLine.indexOf('*');
             if (starPos !== -1) {
                 editor.replaceRange("", { line: targetOptionLineNum, ch: starPos }, { line: targetOptionLineNum, ch: starPos + 1 });
             }
        } else {
            editor.replaceRange("*", { line: targetOptionLineNum, ch: insertPos });
        }
    });

    const updatedText = editor.getValue();
    const updatedParsed = parseQuizText(updatedText);
    updatePreview(updatedParsed);
    applySyntaxHighlighting(editor);
}

// --- NEW: Image Upload/URL Handling ---

// Function to trigger the hidden file input
function triggerImageUpload() {
    const fileInput = document.getElementById('image-upload-input');
    if (fileInput) {
        fileInput.click(); // Programmatically click the hidden file input
    }
}

// Function to handle adding an image from a URL
function addImageFromUrl() {
    if (!editor) return;
    const imageUrl = prompt("Nhập URL hình ảnh:");
    if (imageUrl) {
        uploadImage(null, imageUrl); // Call the upload function with the URL
    }
}

// Function to handle the actual upload (file or URL) to the backend
async function uploadImage(file, url) {
    if (!editor) return;
    const formData = new FormData();
    let isUploadingFile = false;

    if (file) {
        formData.append('imageFile', file);
        isUploadingFile = true;
        console.log("Uploading file:", file.name);
    } else if (url) {
        formData.append('imageUrl', url);
        console.log("Sending URL for processing:", url);
    } else {
        alert('Không có tệp hoặc URL nào được cung cấp.'); // No file or URL provided
        return;
    }

    // Display some kind of loading indicator near the editor or button
    showImageUploadIndicator(true);

    try {
        const response = await fetch('/api/admin/upload-image', {
            method: 'POST',
            body: formData,
            // No 'Content-Type' header needed, browser sets it correctly for FormData
        });

        const result = await response.json();

        if (response.ok && result.success && result.imageUrl) {
            // Remember cursor position
            const cursorPos = editor.getCursor();
            
            // Insert the image tag at cursor position
            const imageTag = `[img src="${result.imageUrl}"]`;
            editor.replaceSelection(imageTag);
            
            // Make sure it's actually inserted into the editor's value
            console.log("Image tag inserted:", imageTag);
            editor.focus();
            
            // Critical steps to ensure changes are saved
            editor.refresh(); // Force a refresh of the editor
            
            // Update the editor's underlying textarea
            editor.save();
            
            // Also trigger a change event to update preview and syntax highlighting
            const currentText = editor.getValue();
            console.log("Editor text after image insertion:", currentText.substring(Math.max(0, cursorPos.ch - 10), cursorPos.ch + imageTag.length + 10));
            
            // Update preview and highlighting
            const parsed = parseQuizText(currentText);
            updatePreview(parsed);
            applySyntaxHighlighting(editor);
            
            // Successful status message
            console.log("Image uploaded and inserted successfully");
        } else {
            throw new Error(result.error || 'Upload không thành công.'); // Upload failed
        }
    } catch (error) {
        console.error("Image upload error:", error);
        alert(`Lỗi tải lên hình ảnh: ${error.message}`); // Image upload error
    } finally {
         showImageUploadIndicator(false);
         // Reset file input value if a file was uploaded to allow uploading the same file again
         if (isUploadingFile) {
             const fileInput = document.getElementById('image-upload-input');
             if (fileInput) fileInput.value = null;
         }
    }
}

// Helper to show/hide a simple loading indicator (customize as needed)
function showImageUploadIndicator(show) {
     // Example: Add/remove a class to a button or display a message
     const uploadButton = document.querySelector('.editor-toolbar button[onclick="triggerImageUpload()"]');
     if (uploadButton) {
         uploadButton.disabled = show;
         uploadButton.textContent = show ? 'Đang tải...' : ' Tải ảnh'; // Update text
         // Re-add icon if needed when not loading
         if (!show) uploadButton.innerHTML = '<i class="fas fa-upload"></i> Tải ảnh';
     }
     const urlButton = document.querySelector('.editor-toolbar button[onclick="addImageFromUrl()"]');
     if(urlButton) {
         urlButton.disabled = show;
     }
     // You could also add a dedicated loading spinner element
}

// --- END: Image Upload/URL Handling ---

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

// Add utility for debugging session storage issues
function debugSessionStorage() {
    console.log("==== SESSION STORAGE DEBUG ====");
    try {
        // Test if sessionStorage is available and working
        sessionStorage.setItem('test_key', 'test_value');
        const testValue = sessionStorage.getItem('test_key');
        console.log("SessionStorage test: " + (testValue === 'test_value' ? 'PASSED' : 'FAILED'));
        sessionStorage.removeItem('test_key');
        
        // Check lesson data
        const lessonData = sessionStorage.getItem('lessonStage1Data');
        console.log("lessonStage1Data in sessionStorage: " + (lessonData ? 'PRESENT' : 'MISSING'));
        if (lessonData) {
            try {
                const parsedData = JSON.parse(lessonData);
                console.log("Storage data successfully parsed, contains questions:", !!parsedData.questions);
                console.log("Questions count:", parsedData.questions ? parsedData.questions.length : 0);
            } catch (e) {
                console.error("Error parsing session storage data:", e);
            }
        }
        
        // Check backup in localStorage
        const backupData = localStorage.getItem('lessonStage1Data_backup');
        console.log("lessonStage1Data_backup in localStorage: " + (backupData ? 'PRESENT' : 'MISSING'));
        
    } catch (e) {
        console.error("Session storage test error:", e);
        alert("Your browser may have issues with sessionStorage. Please enable cookies and storage for this site.");
    }
    console.log("==============================");
}

// Run debug automatically on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(debugSessionStorage, 500);
});