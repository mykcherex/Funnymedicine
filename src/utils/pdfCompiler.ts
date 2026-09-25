import { jsPDF } from 'jspdf';
import { ChatMessage } from '../types';

export interface PdfExportOptions {
  title?: string;
  documentName?: string;
}

/**
 * Compiles selected Gemini AI responses into a beautifully formatted PDF document
 * entirely on the client side (zero API calls, 100% offline & fast).
 * Saves directly to the user's phone / device storage.
 */
export function compileResponsesToPdf(
  selectedMessages: ChatMessage[],
  options: PdfExportOptions = {}
): boolean {
  if (!selectedMessages || selectedMessages.length === 0) {
    return false;
  }

  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // Helper to check page break
    const ensureSpace = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - margin - 12) {
        doc.addPage();
        y = margin;
        return true;
      }
      return false;
    };

    // Document Header Banner
    doc.setFillColor(30, 27, 75); // Dark Indigo
    doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(options.title || 'DocuGemini — AI Responses Export', margin + 6, y + 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(199, 210, 254); // Light Indigo
    const dateStr = new Date().toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    doc.text(`Compiled ${selectedMessages.length} AI response(s) on ${dateStr}`, margin + 6, y + 16);

    if (options.documentName) {
      doc.text(`Source Document: ${options.documentName}`, margin + 6, y + 21);
      y += 28;
    } else {
      y += 28;
    }

    // Process each selected response
    selectedMessages.forEach((msg, index) => {
      ensureSpace(28);

      // Section Header Box
      doc.setFillColor(241, 245, 249); // slate-100
      doc.roundedRect(margin, y, contentWidth, 11, 2, 2, 'F');
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.setLineWidth(0.2);
      doc.roundedRect(margin, y, contentWidth, 11, 2, 2, 'S');

      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const modelName = msg.model || 'Gemini AI';
      doc.text(`Response #${index + 1} • ${modelName}`, margin + 4, y + 7);

      const timeText = new Date(msg.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(timeText, pageWidth - margin - 4 - doc.getTextWidth(timeText), y + 7);

      y += 14;

      // Attachment reference note if any
      if (msg.attachment) {
        ensureSpace(8);
        doc.setFillColor(238, 242, 255); // indigo-50
        doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'F');
        doc.setTextColor(79, 70, 229); // indigo-600
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        const refText = `Referenced: ${msg.attachment.documentName || 'Document'}${
          msg.attachment.pageNumber ? ` (Page ${msg.attachment.pageNumber})` : ''
        }`;
        doc.text(refText, margin + 4, y + 4.8);
        y += 9;
      }

      // Content text formatting
      doc.setTextColor(30, 41, 59); // slate-800
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      // Split content by paragraphs
      const paragraphs = (msg.content || '').split('\n');

      for (let p of paragraphs) {
        // Clean markdown bold markers for PDF clean text rendering
        const isHeading = p.startsWith('# ') || p.startsWith('## ') || p.startsWith('### ');
        const cleanParagraph = p
          .replace(/^#+\s*/, '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/`([^`]+)`/g, '$1');

        if (isHeading) {
          ensureSpace(10);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(15, 23, 42);
          const lines = doc.splitTextToSize(cleanParagraph, contentWidth - 4);
          for (const line of lines) {
            ensureSpace(5.5);
            doc.text(line, margin + 2, y + 4);
            y += 5.5;
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(30, 41, 59);
        } else if (cleanParagraph.trim().length === 0) {
          // Empty line spacing
          y += 3.5;
        } else {
          const lines = doc.splitTextToSize(cleanParagraph, contentWidth - 4);
          for (const line of lines) {
            ensureSpace(5);
            doc.text(line, margin + 2, y + 4);
            y += 4.8;
          }
        }
      }

      // Divider line between responses
      if (index < selectedMessages.length - 1) {
        y += 4;
        ensureSpace(8);
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
      } else {
        y += 6;
      }
    });

    // Add page numbers on all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `DocuGemini • Page ${i} of ${totalPages}`,
        margin,
        pageHeight - 8
      );
      doc.text(
        'Compiled directly on client device (No AI re-query)',
        pageWidth - margin - doc.getTextWidth('Compiled directly on client device (No AI re-query)'),
        pageHeight - 8
      );
    }

    // Save PDF directly to phone / computer
    const fileName = `Gemini-AI-Responses-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}.pdf`;
    
    // Save triggers native download/save sheet on mobile & desktop browsers
    doc.save(fileName);
    return true;
  } catch (err) {
    console.error('Failed to compile responses to PDF:', err);
    return false;
  }
}

/**
 * Copies multiple selected responses together with clean formatting (Telegram-style).
 */
export function formatResponsesForClipboard(selectedMessages: ChatMessage[]): string {
  return selectedMessages
    .map((msg, index) => {
      const model = msg.model || 'Gemini AI';
      const time = new Date(msg.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const attachmentInfo = msg.attachment
        ? ` [Document: ${msg.attachment.documentName}${msg.attachment.pageNumber ? ` p.${msg.attachment.pageNumber}` : ''}]`
        : '';
      return `─── Response ${index + 1} (${model} • ${time}${attachmentInfo}) ───\n${msg.content}`;
    })
    .join('\n\n');
}
