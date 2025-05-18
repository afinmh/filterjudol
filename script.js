let model;
let vocab;

// Fungsi untuk memuat model dan vocabulary
async function initModel() {
    try {
        // Tampilkan loading
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('analyzeBtn').disabled = true;

        // Memuat model
        model = await tf.loadLayersModel('model/model.json');
        
        // Memuat vocabulary
        const response = await fetch('model/vocabs.json');
        vocab = await response.json();
        
        console.log('Model dan vocabulary berhasil dimuat!');
        
        // Sembunyikan loading dan aktifkan tombol
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('analyzeBtn').disabled = false;
    } catch (error) {
        console.error('Error memuat model:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Terjadi kesalahan saat memuat model. Silakan refresh halaman.',
            confirmButtonText: 'OK'
        });
    }
}

// Fungsi untuk tokenisasi teks
function tokenize(text, maxLen = 100) {
    const sequence = text.toLowerCase()
        .split(/\s+/)
        .map(word => vocab[word] || 0);
    
    const padded = new Array(maxLen).fill(0);
    const start = Math.max(0, maxLen - sequence.length);
    
    for (let i = 0; i < Math.min(sequence.length, maxLen); i++) {
        padded[start + i] = sequence[i];
    }
    
    return tf.tensor2d([padded], [1, maxLen]);
}

// Fungsi untuk menganalisis komentar
async function analyzeComment(text) {
    if (!model || !vocab) {
        await initModel();
    }
    
    const input = tokenize(text);
    const prediction = model.predict(input);
    const confidence = prediction.dataSync()[0];
    
    // Klasifikasi berdasarkan threshold
    let category;
    if (confidence < 0.001) { // 0.1%
        category = 'normal';
    } else if (confidence < 0.0014) { // 0.14%
        category = 'suspicious';
    } else {
        category = 'judol';
    }
    
    return {
        category: category,
        confidence: confidence
    };
}

// Event listener untuk tombol analisis
document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const text = document.getElementById('commentInput').value.trim();
    
    if (!text) {
        Swal.fire({
            icon: 'warning',
            title: 'Peringatan',
            text: 'Silakan masukkan komentar terlebih dahulu!',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    try {
        // Tampilkan loading
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('analyzeBtn').disabled = true;
        
        const result = await analyzeComment(text);
        const resultDiv = document.getElementById('result');
        
        // Update tampilan hasil
        document.getElementById('analyzedText').textContent = text;
        document.getElementById('status').textContent = 
            result.category === 'judol' ? 'Komentar Judi' :
            result.category === 'suspicious' ? 'Komentar Mencurigakan' :
            'Komentar Normal';
        document.getElementById('confidence').textContent = 
            `${(result.confidence * 100).toFixed(4)}%`;
        
        // Update styling
        resultDiv.className = `result-section ${result.category}`;
        document.getElementById('status').className = result.category;
        
        // Tampilkan hasil
        resultDiv.classList.remove('hidden');
    } catch (error) {
        console.error('Error menganalisis komentar:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Terjadi kesalahan saat menganalisis komentar. Silakan coba lagi.',
            confirmButtonText: 'OK'
        });
    } finally {
        // Sembunyikan loading dan aktifkan tombol
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('analyzeBtn').disabled = false;
    }
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Show active tab content
        const tabId = button.dataset.tab + '-tab';
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
    });
});

// File upload handling
const csvFile = document.getElementById('csvFile');
const fileName = document.getElementById('fileName');
const analyzeBatchBtn = document.getElementById('analyzeBatchBtn');

csvFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        fileName.textContent = file.name;
        analyzeBatchBtn.disabled = false;
    } else {
        fileName.textContent = '';
        analyzeBatchBtn.disabled = true;
    }
});

// Fungsi untuk menghilangkan komentar duplikat
function removeDuplicates(comments) {
    const uniqueComments = new Map();
    
    comments.forEach(comment => {
        // Normalisasi komentar (lowercase dan trim)
        const normalizedComment = comment.comment.toLowerCase().trim();
        
        // Jika komentar belum ada atau confidence lebih tinggi, update
        if (!uniqueComments.has(normalizedComment) || 
            comment.confidence > uniqueComments.get(normalizedComment).confidence) {
            uniqueComments.set(normalizedComment, comment);
        }
    });
    
    return Array.from(uniqueComments.values());
}

// Fungsi untuk delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Batch analysis
analyzeBatchBtn.addEventListener('click', async () => {
    const file = csvFile.files[0];
    if (!file) return;

    try {
        // Show loading
        document.getElementById('loading').classList.remove('hidden');
        analyzeBatchBtn.disabled = true;

        // Reset progress bar
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        progressFill.style.width = '0%';
        progressText.textContent = 'Menghitung total data...';

        // Parse CSV
        const text = await file.text();
        const { data } = Papa.parse(text, {
            header: true,
            skipEmptyLines: true
        });

        // Count total valid comments (non-empty)
        const totalComments = data.filter(row => row.comment && row.comment.trim()).length;
        let processedComments = 0;

        // Update progress text to show total
        progressText.textContent = `0 dari ${totalComments} komentar`;
        await delay(100); // Small delay to ensure UI updates

        // Initialize arrays for results
        const normalComments = [];
        const suspiciousComments = [];
        const judolComments = [];

        // Process each comment
        for (const row of data) {
            if (!row.comment || !row.comment.trim()) continue;

            const result = await analyzeComment(row.comment);
            const commentData = {
                ...row, // Preserve all original columns
                confidence: result.confidence,
                category: result.category
            };

            switch (result.category) {
                case 'normal':
                    normalComments.push(commentData);
                    break;
                case 'suspicious':
                    suspiciousComments.push(commentData);
                    break;
                case 'judol':
                    judolComments.push(commentData);
                    break;
            }

            // Update progress
            processedComments++;
            const progress = (processedComments / totalComments) * 100;
            
            // Update UI in next tick to ensure smooth rendering
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    progressFill.style.width = `${progress}%`;
                    progressText.textContent = `${processedComments} dari ${totalComments} komentar`;
                    resolve();
                });
            });

            // Add small delay every 10 comments to ensure UI updates
            if (processedComments % 10 === 0) {
                await delay(10);
            }
        }

        // Final progress update
        progressFill.style.width = '100%';
        progressText.textContent = `${totalComments} dari ${totalComments} komentar`;
        await delay(100);

        // Remove duplicates from each category
        const uniqueNormalComments = removeDuplicates(normalComments);
        const uniqueSuspiciousComments = removeDuplicates(suspiciousComments);
        const uniqueJudolComments = removeDuplicates(judolComments);

        // Sort comments by confidence (descending)
        const sortByConfidence = (a, b) => b.confidence - a.confidence;
        uniqueNormalComments.sort(sortByConfidence);
        uniqueSuspiciousComments.sort(sortByConfidence);
        uniqueJudolComments.sort(sortByConfidence);

        // Update statistics
        document.getElementById('normalCount').textContent = uniqueNormalComments.length;
        document.getElementById('suspiciousCount').textContent = uniqueSuspiciousComments.length;
        document.getElementById('judolCount').textContent = uniqueJudolComments.length;

        // Update tables
        updateTable('normalTable', uniqueNormalComments);
        updateTable('suspiciousTable', uniqueSuspiciousComments);
        updateTable('judolTable', uniqueJudolComments);

        // Show results
        document.getElementById('batchResult').classList.remove('hidden');

        // Show summary of removed duplicates
        const totalUniqueComments = uniqueNormalComments.length + uniqueSuspiciousComments.length + uniqueJudolComments.length;
        const removedDuplicates = totalComments - totalUniqueComments;
        
        if (removedDuplicates > 0) {
            Swal.fire({
                icon: 'info',
                title: 'Analisis Selesai',
                html: `
                    <div style="text-align: left;">
                        <p><strong>Total komentar:</strong> ${totalComments}</p>
                        <p><strong>Komentar unik:</strong> ${totalUniqueComments}</p>
                        <p><strong>Komentar duplikat dihapus:</strong> ${removedDuplicates}</p>
                    </div>
                `,
                confirmButtonText: 'OK'
            });
        }

    } catch (error) {
        console.error('Error analyzing batch:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Terjadi kesalahan saat menganalisis file CSV. Silakan coba lagi.',
            confirmButtonText: 'OK'
        });
    } finally {
        // Hide loading
        document.getElementById('loading').classList.add('hidden');
        analyzeBatchBtn.disabled = false;
    }
});

// Fungsi untuk memotong teks yang terlalu panjang
function truncateText(text, maxLength = 30) {
    if (!text) return '';
    text = text.trim();
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Update fungsi updateTable untuk memperbaiki tampilan
function updateTable(tableId, comments) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';

    comments.forEach((comment) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${comment.label || ''}</td>
            <td>${comment.author || ''}</td>
            <td>${comment.comment.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
            <td>${comment.id || ''}</td>
            <td>${comment.channel || ''}</td>
            <td title="${comment.title || ''}">${truncateText(comment.title)}</td>
            <td>${(comment.confidence * 100).toFixed(4)}%</td>
        `;
        tbody.appendChild(row);
    });
}

// Fungsi untuk mengkonversi data ke CSV
function convertToCSV(data, category) {
    const headers = ['label', 'author', 'comment', 'id', 'channel', 'title', 'confidence'];
    const rows = data.map(item => [
        item.label || '',
        item.author || '',
        item.comment,
        item.id || '',
        item.channel || '',
        item.title || '',
        (item.confidence * 100).toFixed(4) + '%'
    ]);
    
    return [headers, ...rows]
        .map(row => row.map(cell => {
            // Escape quotes and wrap in quotes if contains comma or newline
            const cellStr = String(cell).replace(/"/g, '""');
            return /[",\n\r]/.test(cellStr) ? `"${cellStr}"` : cellStr;
        }).join(','))
        .join('\n');
}

// Fungsi untuk download CSV
function downloadCSV(data, category) {
    const csv = convertToCSV(data, category);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `komentar_${category}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Event listener untuk tombol download
document.querySelectorAll('.download-btn').forEach(button => {
    button.addEventListener('click', () => {
        const category = button.dataset.table;
        const tableId = `${category}Table`;
        const tbody = document.querySelector(`#${tableId} tbody`);
        const rows = Array.from(tbody.querySelectorAll('tr'));
        
        const data = rows.map(row => {
            const cells = row.querySelectorAll('td');
            return {
                label: cells[0].textContent,
                author: cells[1].textContent,
                comment: cells[2].textContent,
                id: cells[3].textContent,
                channel: cells[4].textContent,
                title: cells[5].textContent,
                confidence: parseFloat(cells[6].textContent) / 100
            };
        });
        
        const categoryLabels = {
            normal: 'Normal',
            suspicious: 'Mencurigakan',
            judol: 'Judi'
        };
        
        downloadCSV(data, categoryLabels[category]);
    });
});

// Inisialisasi model saat halaman dimuat
initModel(); 