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