import fs from 'fs';
import { GeminiService } from './gemini.service.js';
import { RESUME_EXTRACTION_PROMPT } from '../prompts/resume.prompt.js';
import { resumeDataSchema } from '../schemas/resume.schema.js';
import { Resume } from '../models/Resume.js';
import { Interview } from '../models/Interview.js';
import { PdfParserService } from './pdfParser.service.js';

export class ResumeExtractionService {
  static async extractResume({ interviewId, candidateId, filePath, fileName }) {
    console.log('[ResumeExtraction] Starting extraction for interview:', interviewId, ', file:', fileName, ', path:', filePath);
    let resumeDoc = await Resume.findOne({ interviewId });
    if (!resumeDoc) {
      resumeDoc = new Resume({
        interviewId,
        candidateId,
        fileName,
        tempFilePath: filePath,
        status: 'processing'
      });
    } else {
      resumeDoc.fileName = fileName;
      resumeDoc.tempFilePath = filePath;
      resumeDoc.status = 'processing';
      resumeDoc.error = null;
    }
    await resumeDoc.save();

    try {
      const extractedData = await GeminiService.generateJsonWithPdf({
        prompt: RESUME_EXTRACTION_PROMPT,
        filePath,
        fileName,
        schema: resumeDataSchema,
        maxRetries: 2
      });

      // Clean and deduplicate skills, remove proficiency tags
      if (extractedData.skills) {
        extractedData.skills = PdfParserService.deduplicateSkills(extractedData.skills);
      }

      // Filter out high school / secondary board marks from claims
      if (extractedData.claims && Array.isArray(extractedData.claims)) {
        extractedData.claims = extractedData.claims.filter(
          (c) => !/Secondary|School|CBSE|HSC|SSC|Junior College|-- \d/i.test(c.text || '')
        );
      }

      console.log('[ResumeExtraction] Extraction complete — candidate:', extractedData?.candidate?.name, ', skills:', extractedData?.skills?.length, ', claims:', extractedData?.claims?.length);

      resumeDoc.status = 'extracted';
      resumeDoc.data = extractedData;
      resumeDoc.error = null;
      resumeDoc.tempFilePath = filePath;
      await resumeDoc.save();

      // Update interview reference
      await Interview.findByIdAndUpdate(interviewId, {
        resumeId: resumeDoc._id
      });

      return resumeDoc;
    } catch (err) {
      console.error('[ResumeExtraction] FAILED for interview:', interviewId, ', error:', err.message);
      resumeDoc.status = 'failed';
      resumeDoc.error = err.message || 'Unable to process the resume PDF.';
      await resumeDoc.save();

      throw err;
    }
  }
}

export default ResumeExtractionService;
