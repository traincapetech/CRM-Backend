const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

// Function to get all files recursively
async function getFiles(dir) {
  const files = [];
  const items = await readdir(dir);

  for (const item of items) {
    if (item.startsWith('.') || item === 'node_modules' || item === 'dist' || item === 'build') continue;

    const fullPath = path.join(dir, item);
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      const subFiles = await getFiles(fullPath);
      files.push(...subFiles);
    } else {
      // Only include code files
      const ext = path.extname(item).toLowerCase();
      if (['.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.json', '.md'].includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function generatePDF() {
  try {
    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: 50,
        bottom: 50,
        left: 50,
        right: 50
      }
    });

    // Pipe output to file
    doc.pipe(fs.createWriteStream('code_documentation.pdf'));

    // Set font
    doc.font('Helvetica');

    // Get all files
    const rootDir = path.join(__dirname, '..');
    const files = await getFiles(rootDir);

    // Sort files by directory and name
    files.sort((a, b) => a.localeCompare(b));

    // Process each file
    for (const file of files) {
      // Get relative path for display
      const relativePath = path.relative(rootDir, file);
      
      // Add page break except for first page
      if (doc.page.pageNumber > 1) {
        doc.addPage();
      }

      // Add file path as header
      doc.fontSize(16)
         .fillColor('#2563eb')
         .text(relativePath, { underline: true })
         .moveDown();

      // Read and add file content
      const content = await readFile(file, 'utf8');
      
      // Add file content with monospace font and smaller size
      doc.font('Courier')
         .fontSize(10)
         .fillColor('#000000')
         .text(content, {
           lineGap: 2,
           align: 'left'
         })
         .moveDown();
    }

    // Finalize PDF
    doc.end();
    console.log('PDF generated successfully: code_documentation.pdf');
  } catch (error) {
    console.error('Error generating PDF:', error);
  }
}

// Run the script
generatePDF(); 