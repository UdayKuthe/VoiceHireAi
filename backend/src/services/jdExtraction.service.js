import fs from 'fs';
import { GeminiService } from './gemini.service.js';
import { JD_EXTRACTION_PROMPT } from '../prompts/jd.prompt.js';
import { jdDataSchema } from '../schemas/jd.schema.js';
import { JobDescription } from '../models/JobDescription.js';
import { Interview } from '../models/Interview.js';

export class JdExtractionService {
  static async extractJd({ interviewId, filePath, fileName }) {
    console.log('[JdExtraction] Starting extraction for interview:', interviewId, ', file:', fileName, ', path:', filePath);
    let jdDoc = await JobDescription.findOne({ interviewId });
    if (!jdDoc) {
      jdDoc = new JobDescription({
        interviewId,
        fileName,
        tempFilePath: filePath,
        status: 'processing'
      });
    } else {
      jdDoc.fileName = fileName;
      jdDoc.tempFilePath = filePath;
      jdDoc.status = 'processing';
      jdDoc.error = null;
    }
    await jdDoc.save();

    try {
      const extractedData = await GeminiService.generateJsonWithPdf({
        prompt: JD_EXTRACTION_PROMPT,
        filePath,
        fileName,
        schema: jdDataSchema,
        maxRetries: 2
      });

      console.log('[JdExtraction] Extraction complete — title:', extractedData?.job_title, ', required_skills:', extractedData?.required_skills?.length);

      jdDoc.status = 'extracted';
      jdDoc.data = extractedData;
      jdDoc.error = null;
      jdDoc.tempFilePath = filePath;
      await jdDoc.save();

      // Update interview reference
      await Interview.findByIdAndUpdate(interviewId, {
        jdId: jdDoc._id
      });

      return jdDoc;
    } catch (err) {
      console.error('[JdExtraction] FAILED for interview:', interviewId, ', error:', err.message);
      jdDoc.status = 'failed';
      jdDoc.error = err.message || 'Unable to process the JD PDF.';
      await jdDoc.save();

      throw err;
    }
  }
}

export default JdExtractionService;
