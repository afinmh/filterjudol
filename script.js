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
        const response = await fetch('model/vocab.json');
        vocab = await response.json();
        
        console.log('Model dan vocabulary berhasil dimuat!');
        
        // Sembunyikan loading dan aktifkan tombol
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('analyzeBtn').disabled = false;
    } catch (error) {
        console.error('Error memuat model:', error);
        alert('Terjadi kesalahan saat memuat model. Silakan refresh halaman.');
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
        alert('Silakan masukkan komentar terlebih dahulu!');
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
        alert('Terjadi kesalahan saat menganalisis komentar. Silakan coba lagi.');
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

// Batch analysis
analyzeBatchBtn.addEventListener('click', async () => {
    const file = csvFile.files[0];
    if (!file) return;

    try {
        // Show loading
        document.getElementById('loading').classList.remove('hidden');
        analyzeBatchBtn.disabled = true;

        // Parse CSV
        const text = await file.text();
        const { data } = Papa.parse(text, {
            header: true,
            skipEmptyLines: true
        });

        // Initialize arrays for results
        const normalComments = [];
        const suspiciousComments = [];
        const judolComments = [];

        // Process each comment
        for (const row of data) {
            if (!row.comment) continue;

            const result = await analyzeComment(row.comment);
            const commentData = {
                comment: row.comment,
                confidence: result.confidence
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
        }

        // Update statistics
        document.getElementById('normalCount').textContent = normalComments.length;
        document.getElementById('suspiciousCount').textContent = suspiciousComments.length;
        document.getElementById('judolCount').textContent = judolComments.length;

        // Update tables
        updateTable('normalTable', normalComments);
        updateTable('suspiciousTable', suspiciousComments);
        updateTable('judolTable', judolComments);

        // Show results
        document.getElementById('batchResult').classList.remove('hidden');

    } catch (error) {
        console.error('Error analyzing batch:', error);
        alert('Terjadi kesalahan saat menganalisis file CSV. Silakan coba lagi.');
    } finally {
        // Hide loading
        document.getElementById('loading').classList.add('hidden');
        analyzeBatchBtn.disabled = false;
    }
});

// Fungsi untuk mengkonversi data ke CSV
function convertToCSV(data, category) {
    const headers = ['No', 'Komentar', 'Kepercayaan', 'Kategori'];
    const rows = data.map((item, index) => [
        index + 1,
        item.comment,
        (item.confidence * 100).toFixed(4) + '%',
        category
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
                comment: cells[1].textContent,
                confidence: parseFloat(cells[2].textContent) / 100
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

// Update fungsi updateTable untuk memperbaiki tampilan
function updateTable(tableId, comments) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';

    comments.forEach((comment, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${comment.comment.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
            <td>${(comment.confidence * 100).toFixed(4)}%</td>
        `;
        tbody.appendChild(row);
    });
}

// Inisialisasi model saat halaman dimuat
initModel(); 