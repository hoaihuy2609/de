// latexVitePlugin.ts - Vite Dev Server plugin để compile LaTeX trực tiếp
import { Plugin } from 'vite';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export function latexCompilerPlugin(): Plugin {
  return {
    name: 'latex-compiler-plugin',
    configureServer(server) {
      server.middlewares.use('/api/compile-latex', (req, res, next) => {
        if (req.method !== 'POST') {
          return next();
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const texContent = data.tex;

            if (!texContent) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: 'Missing tex content' }));
            }

            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'physivault-tex-'));
            const texFile = path.join(tempDir, 'exam.tex');
            const pdfFile = path.join(tempDir, 'exam.pdf');

            fs.writeFileSync(texFile, texContent, 'utf-8');

            // Gọi pdflatex
            const proc = spawn('pdflatex', ['-interaction=batchmode', 'exam.tex'], {
              cwd: tempDir,
              windowsHide: true,
            });

            proc.on('close', code => {
              if (fs.existsSync(pdfFile)) {
                const pdfBuffer = fs.readFileSync(pdfFile);
                res.writeHead(200, {
                  'Content-Type': 'application/pdf',
                  'Content-Disposition': 'attachment; filename="exam.pdf"',
                  'Content-Length': pdfBuffer.length,
                });
                res.end(pdfBuffer);

                // Dọn dẹp thư mục tạm
                try {
                  fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (_) {}
              } else {
                let logContent = '';
                const logFile = path.join(tempDir, 'exam.log');
                if (fs.existsSync(logFile)) {
                  logContent = fs.readFileSync(logFile, 'utf-8').slice(-1000);
                }
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Compilation failed', code, log: logContent }));

                try {
                  fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (_) {}
              }
            });

            proc.on('error', err => {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
              try {
                fs.rmSync(tempDir, { recursive: true, force: true });
              } catch (_) {}
            });
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });
    },
  };
}
