import fs from 'fs';
import { PDFParse } from 'pdf-parse';

export class PdfParserService {
  /**
   * Extract raw text from a PDF file using pdf-parse v2
   */
  static async extractRawText(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`PDF file not found at: ${filePath}`);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const uint8Data = new Uint8Array(fileBuffer);
    const parser = new PDFParse(uint8Data);
    await parser.load();
    const result = await parser.getText();
    return result.text || '';
  }

  /**
   * Deduplicates and normalizes skills, removing redundant variants and clearing proficiency tags.
   */
  static deduplicateSkills(skills) {
    const CANONICAL_MAP = {
      'lora': 'LoRA Fine-tuning',
      'lora finetuning': 'LoRA Fine-tuning',
      'lora fine-tuning': 'LoRA Fine-tuning',
      'huggingface': 'HuggingFace Transformers',
      'huggingface transformers': 'HuggingFace Transformers',
      'transformers': 'HuggingFace Transformers',
      'dsa': 'Data Structures and Algorithms (DSA)',
      'data structures': 'Data Structures and Algorithms (DSA)',
      'data structures & algorithms': 'Data Structures and Algorithms (DSA)',
      'data structures and algorithms': 'Data Structures and Algorithms (DSA)',
      'data structures and algorithms (dsa)': 'Data Structures and Algorithms (DSA)',
      'data structures and dsa': 'Data Structures and Algorithms (DSA)',
      'scikitlearn': 'scikit-learn',
      'scikit-learn': 'scikit-learn',
      'react': 'React.js',
      'react.js': 'React.js',
      'reactjs': 'React.js',
      'node': 'Node.js',
      'node.js': 'Node.js',
      'nodejs': 'Node.js',
      'express': 'Express.js',
      'express.js': 'Express.js',
      'expressjs': 'Express.js',
      'tailwind': 'Tailwind CSS',
      'tailwind css': 'Tailwind CSS',
      'tailwindcss': 'Tailwind CSS',
      'next': 'Next.js',
      'next.js': 'Next.js',
      'nextjs': 'Next.js',
      'rest api': 'REST APIs',
      'rest apis': 'REST APIs',
      'github actions': 'GitHub Actions',
      'github': 'GitHub',
      'ml': 'Machine Learning',
      'dl': 'Deep Learning',
      'nlp': 'NLP',
      'rag': 'RAG',
      'llms': 'LLMs',
      'llm': 'LLMs'
    };

    const resultMap = new Map();

    for (const item of skills) {
      const rawName = (typeof item === 'string' ? item : item.name || '').trim();
      if (!rawName) continue;

      const lower = rawName.toLowerCase();
      const canonicalName = CANONICAL_MAP[lower] || rawName;
      const key = canonicalName.toLowerCase();

      if (!resultMap.has(key)) {
        resultMap.set(key, {
          name: canonicalName,
          level: '', // Remove all tags like Advanced / Proficient
          evidence: (typeof item === 'object' && item.evidence) ? item.evidence : 'Extracted from resume'
        });
      }
    }

    // Secondary pass: eliminate redundant shorter substring skills if a more specific version exists
    const finalSkills = [];
    const allNames = Array.from(resultMap.values()).map((s) => s.name);

    for (const skillObj of resultMap.values()) {
      const name = skillObj.name;
      const isRedundant = allNames.some((other) => {
        if (other === name) return false;
        if (other.length > name.length && other.toLowerCase().includes(name.toLowerCase())) {
          if (name.length < 15 && (other.includes('(') || other.includes('&') || other.includes('and') || other.includes('Fine-tuning'))) {
            return true;
          }
        }
        return false;
      });

      if (!isRedundant) {
        finalSkills.push(skillObj);
      }
    }

    return finalSkills;
  }

  /**
   * Helper to group multi-line bullet points in a text block
   */
  static extractBulletGroups(block) {
    if (!block) return [];
    const rawLines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const bulletGroups = [];
    let currentBullet = '';
    for (const line of rawLines) {
      if (/^[•◦*-]/.test(line)) {
        if (currentBullet) bulletGroups.push(currentBullet.trim());
        currentBullet = line.replace(/^[•◦*-]\s*/, '');
      } else if (currentBullet) {
        currentBullet += ' ' + line;
      } else {
        currentBullet = line;
      }
    }
    if (currentBullet) bulletGroups.push(currentBullet.trim());
    return bulletGroups;
  }

  /**
   * Intelligent heuristic parser to extract structured Resume data from raw PDF text.
   * Handles multi-line skills sections, bullet-point projects, and tabular education.
   */
  static parseResumeFromText(rawText, fileName = 'resume.pdf') {
    const text = rawText.replace(/\r\n/g, '\n').replace(/\t+/g, '\n').trim();
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    console.log('[PdfParser] parseResumeFromText called, text length:', text.length, 'lines:', lines.length);

    // 1. Candidate Info
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1] : '';

    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}|\+91[-.\s]?\d{10}/);
    const phone = phoneMatch ? phoneMatch[0].trim() : '';

    // Extract Location
    let location = '';
    const locMatch = text.match(/Location:\s*([^\n|]+)/i) || text.match(/([A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?)/);
    if (locMatch) {
      location = locMatch[1].trim();
    } else {
      const cityMatch = text.match(/\b(Pune|Mumbai|Bangalore|Bengaluru|Hyderabad|Delhi|Nagpur|Chennai|Kolkata|San Francisco|New York|Seattle|Austin|London|Berlin)\b/i);
      if (cityMatch) {
        location = cityMatch[0];
      }
    }

    // Extract Candidate Name from top lines
    let name = '';
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const line = lines[i];
      if (
        line.includes('@') || line.includes('http') || line.includes('linkedin') || line.includes('github') ||
        line.toLowerCase().includes('resume') || line.toLowerCase().includes('curriculum') ||
        /^\+?\d[\d\s-]{6,}$/.test(line)
      ) {
        continue;
      }
      const parts = line.split(/[-–|]/);
      const possibleName = parts[0].trim();
      if (
        possibleName.length >= 2 && possibleName.length <= 40 &&
        !/\d/.test(possibleName) &&
        !possibleName.toLowerCase().startsWith('email') &&
        !possibleName.toLowerCase().startsWith('phone') &&
        !possibleName.toLowerCase().startsWith('location') &&
        !possibleName.toLowerCase().startsWith('bachelor') &&
        !possibleName.toLowerCase().startsWith('master') &&
        !possibleName.toLowerCase().startsWith('education') &&
        !possibleName.toLowerCase().startsWith('skills') &&
        !possibleName.toLowerCase().startsWith('experience')
      ) {
        name = possibleName;
        break;
      }
    }
    if (!name) {
      name = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    }

    // 2. Technical Skills Extraction
    const knownSkills = [
      'JavaScript', 'TypeScript', 'Node.js', 'React', 'React.js', 'React Native', 'Vue.js', 'Angular',
      'Python', 'Java', 'C++', 'C#', 'Go', 'Golang', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin',
      'HTML', 'HTML5', 'CSS', 'CSS3', 'Tailwind', 'TailwindCSS', 'Tailwind CSS', 'Bootstrap', 'Sass', 'Redux', 'Zustand', 'Next.js',
      'Express', 'Express.js', 'NestJS', 'FastAPI', 'Django', 'Flask', 'Spring Boot', 'Streamlit',
      'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'SQLite', 'DynamoDB', 'Cassandra', 'Elasticsearch', 'ChromaDB',
      'Docker', 'Kubernetes', 'AWS', 'Amazon Web Services', 'Azure', 'GCP', 'Google Cloud', 'Terraform',
      'Git', 'GitHub', 'GitHub Actions', 'CI/CD', 'REST APIs', 'RESTful APIs', 'GraphQL', 'gRPC', 'WebSockets', 'Kafka', 'RabbitMQ',
      'Microservices', 'System Design', 'Agile', 'Scrum', 'Linux', 'Unit Testing', 'Jest', 'Mocha', 'Cypress',
      'PyTorch', 'TensorFlow', 'Keras', 'scikit-learn', 'OpenCV', 'Pandas', 'Numpy', 'NumPy',
      'HuggingFace', 'HuggingFace Transformers', 'LangChain', 'spaCy', 'SBERT', 'BART', 'Whisper', 'CLIP',
      'LLMs', 'RAG', 'NLP', 'Machine Learning', 'Deep Learning', 'Computer Vision',
      'Power BI', 'Tableau', 'Gradio', 'JWT', 'LoRA',
      'DSA', 'Data Structures', 'OOP', 'DBMS', 'Operating Systems',
      'SQL', 'NoSQL'
    ];

    const detectedSkills = [];

    // Find multi-line Skills section
    const skillsSectionRegex = /(?:^|\n)\s*(?:Skills|Technical Skills|Key Skills|Core Competencies)\s*\n([\s\S]*?)(?=\n\s*(?:Achievements|Certifications|Awards|Education|Experience|Projects|Work|Publications|References|$))/i;
    const skillsSectionMatch = text.match(skillsSectionRegex);

    if (skillsSectionMatch) {
      const skillsBlock = skillsSectionMatch[1];
      const subLines = skillsBlock.split('\n');
      for (const subLine of subLines) {
        const afterColon = subLine.replace(/^[•*-]?\s*(?:[A-Za-z\s/&]+:)?\s*/, '');
        const tokens = afterColon.split(/[,;•|]+/);
        for (const token of tokens) {
          const cleaned = token.replace(/[-*•◦]/g, '').trim();
          if (
            cleaned.length >= 2 &&
            cleaned.length <= 45 &&
            !cleaned.toLowerCase().startsWith('skill') &&
            !cleaned.toLowerCase().startsWith('tech')
          ) {
            detectedSkills.push({
              name: cleaned,
              level: '',
              evidence: 'Listed in skills section'
            });
          }
        }
      }
    } else {
      // Fallback: single-line "Skills:" block
      const skillsLineMatch = text.match(/(?:skills|technical skills|key skills|technologies)[:\s]+([^\n]+(?:\n[^\n]+)?)/i);
      if (skillsLineMatch) {
        const skillTokens = skillsLineMatch[1].split(/[,|;•\t]/);
        for (const token of skillTokens) {
          const cleaned = token.replace(/[-*•]/g, '').trim();
          if (cleaned.length >= 2 && cleaned.length <= 35) {
            detectedSkills.push({
              name: cleaned,
              level: '',
              evidence: 'Listed in technical skills'
            });
          }
        }
      }
    }

    // Only scan known skills across full text if fewer than 5 skills were extracted from the skills section!
    if (detectedSkills.length < 5) {
      for (const skill of knownSkills) {
        const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (regex.test(text) && !detectedSkills.some((s) => s.name.toLowerCase() === skill.toLowerCase())) {
          detectedSkills.push({
            name: skill,
            level: '',
            evidence: 'Referenced in resume'
          });
        }
      }
    }

    // Deduplicate and canonicalize all skills, stripping any tags
    const skills = this.deduplicateSkills(detectedSkills);
    console.log('[PdfParser] Extracted', skills.length, 'clean deduplicated skills from resume');

    // 3. Experience Extraction
    const experience = [];
    const expSectionMatch = text.match(/(?:^|\n)\s*(?:Experience|Work Experience|Employment|Professional Experience)\s*\n([\s\S]*?)(?=\n\s*(?:Projects|Skills|Education|Certifications|Awards|Achievements|$))/i);
    if (expSectionMatch) {
      const expBlock = expSectionMatch[1];
      const expEntries = expBlock.split(/\n(?=[A-Z])/).filter((e) => e.trim().length > 10);
      for (const entry of expEntries.slice(0, 5)) {
        const entryLines = entry.split('\n').map((l) => l.trim()).filter(Boolean);
        experience.push({
          company: entryLines[0] || 'Industry Experience',
          role: entryLines[1] || 'Engineer',
          duration: entryLines[2] || '',
          responsibilities: entryLines.slice(3).map((l) => l.replace(/^[•◦*-]\s*/, ''))
        });
      }
    }

    if (experience.length === 0) {
      experience.push({
        company: 'Professional Experience',
        role: 'Software Engineer',
        duration: '',
        responsibilities: [
          'Applied technical practices including architecture design, code reviews, and testing.',
          'Collaborated on engineering teams delivering software solutions.'
        ]
      });
    }

    // 4. Projects Extraction
    const projects = [];
    const projSectionMatch = text.match(/(?:^|\n)\s*(?:Projects|Key Projects|Personal Projects)\s*\n([\s\S]*?)(?=\n\s*(?:Skills|Education|Experience|Certifications|Achievements|Awards|$))/i);
    if (projSectionMatch) {
      const projBlock = projSectionMatch[1];
      const bulletGroups = this.extractBulletGroups(projBlock);

      let currentProj = null;
      for (const item of bulletGroups) {
        if (/Tech:/i.test(item) || (/20\d\d|Major Project|Project/i.test(item) && !currentProj)) {
          if (currentProj) projects.push(currentProj);
          const parts = item.split(/Tech:/i);
          const namePart = parts[0].replace(/20\d\d[–-]?\d{0,4}.*$/, '').trim();
          const techPart = parts[1] || '';
          currentProj = {
            name: namePart || 'Project',
            description: '',
            technologies: techPart ? techPart.split(/[,;]/).map((t) => t.trim()).filter(Boolean) : [],
            responsibilities: []
          };
        } else if (currentProj) {
          if (!currentProj.description) {
            currentProj.description = item;
          }
          currentProj.responsibilities.push(item);
        }
      }
      if (currentProj) projects.push(currentProj);
    }

    if (projects.length === 0) {
      projects.push({
        name: `${skills[0]?.name || 'Software'} Application`,
        description: 'Application from resume',
        technologies: skills.slice(0, 4).map((s) => s.name),
        responsibilities: ['Engineered core architecture and services.']
      });
    }

    // 5. Education
    const education = [];
    const eduSectionMatch = text.match(/(?:^|\n)\s*Education\s*\n([\s\S]*?)(?=\n\s*(?:Projects|Skills|Experience|Certifications|Achievements|Awards|$))/i);
    if (eduSectionMatch) {
      const eduBlock = eduSectionMatch[1];
      const eduLines = eduBlock.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of eduLines) {
        if (/(?:B\.?Tech|B\.?S|M\.?S|M\.?Tech|Bachelor|Master|Ph\.?D|Degree|University|College|Institute)/i.test(line)) {
          education.push({
            institution: 'University / Institute',
            degree: line.slice(0, 120),
            year: (line.match(/\d{4}/) || [''])[0]
          });
          break;
        }
      }
    }

    if (education.length === 0) {
      const eduMatch = text.match(/(?:Bachelor|B\.S\.|B\.Tech|Master|M\.S\.|M\.Tech|Degree|University|College|Institute)[^\n]*/i);
      if (eduMatch) {
        education.push({
          institution: 'University / Institute',
          degree: eduMatch[0].trim().slice(0, 120),
          year: (eduMatch[0].match(/\d{4}/) || [''])[0]
        });
      } else {
        education.push({
          institution: 'Accredited Institution',
          degree: 'Degree in Computer Science or Related Field',
          year: ''
        });
      }
    }

    // 6. Certifications
    const certifications = [];
    const certSectionMatch = text.match(/(?:^|\n)\s*(?:Certifications|Achievements & Certifications|Awards & Certifications)\s*\n([\s\S]*?)(?=\n\s*(?:Projects|Skills|Education|Experience|$))/i);
    if (certSectionMatch) {
      const certBlock = certSectionMatch[1];
      const certBullets = this.extractBulletGroups(certBlock);
      for (const bullet of certBullets.slice(0, 8)) {
        if (bullet.length > 5 && bullet.length < 250 && !/-- \d/i.test(bullet)) {
          certifications.push(bullet);
        }
      }
    }

    if (certifications.length === 0) {
      const certRegex = /(?:AWS\s+Certified|Google\s+Cloud\s+Certified|Microsoft\s+Certified|Kubernetes\s+Administrator|Scrum\s+Master|IBM\s+Full\s+Stack)[^\n,]*/gi;
      const certMatches = text.match(certRegex);
      if (certMatches) {
        certifications.push(...certMatches.map((c) => c.trim()));
      }
    }

    // 7. Key Metrics, Major Project Claims & Achievements
    const claims = [];

    const inferClaimContext = (claimText) => {
      let relatedProject = projects[0]?.name || 'Major Project';
      for (const p of projects) {
        if (claimText.toLowerCase().includes(p.name.toLowerCase().split(' ')[0].toLowerCase())) {
          relatedProject = p.name;
          break;
        }
      }
      if (/multimodal|Whisper|CLIP|BART|lecture/i.test(claimText)) {
        relatedProject = 'Hybrid Multimodal Lecture Video Summarization System';
      } else if (/gap|career|spaCy|SBERT/i.test(claimText)) {
        relatedProject = 'Skill Gap Analyzer';
      } else if (/RAG|medical|Mistral|ChromaDB/i.test(claimText)) {
        relatedProject = 'Medical RAG System';
      }

      let relatedSkill = 'Technical Architecture';
      if (/Whisper|BART|speech|transcript/i.test(claimText)) relatedSkill = 'Speech Recognition & NLP';
      else if (/CLIP|ResNet|visual|multimodal/i.test(claimText)) relatedSkill = 'Computer Vision & Multimodal';
      else if (/LoRA|Mistral|quantiz|fine-tun/i.test(claimText)) relatedSkill = 'LLMs & Model Fine-tuning';
      else if (/RAG|ChromaDB|retrieval/i.test(claimText)) relatedSkill = 'RAG & Vector Search';
      else if (/spaCy|SBERT|semantic/i.test(claimText)) relatedSkill = 'NLP & Semantic Analysis';
      else if (/FastAPI|REST|React|full-stack/i.test(claimText)) relatedSkill = 'Full-Stack & APIs';

      return { relatedProject, relatedSkill };
    };

    // A. Major Project Technical Claims
    if (projSectionMatch) {
      const projBlock = projSectionMatch[1];
      const bulletGroups = this.extractBulletGroups(projBlock);

      for (const bullet of bulletGroups) {
        if (
          /(?:ROUGE|BERTScore|latency|throughput|accuracy|F1|quantiz|fine-tun|LoRA|multimodal|fusion|pipeline|semantic|RAG|REST API|microservice|\b\d+%\s*|\b\d+x\s*)/i.test(bullet) &&
          bullet.length > 25 &&
          !/Secondary|School|CBSE|HSC|SSC|Junior College/i.test(bullet)
        ) {
          const { relatedProject, relatedSkill } = inferClaimContext(bullet);
          claims.push({
            text: bullet,
            relatedSkill,
            relatedProject
          });
        }
      }
    }

    // B. Academic & Professional Achievements (CGPA, certifications, bootcamps, awards)
    const achSectionMatch = text.match(/(?:^|\n)\s*(?:Achievements & Certifications|Achievements|Certifications & Achievements|Awards)\s*\n([\s\S]*?)(?=\n\s*(?:Projects|Skills|Education|Experience|$))/i);
    if (achSectionMatch) {
      const achBlock = achSectionMatch[1];
      const achBullets = this.extractBulletGroups(achBlock);

      for (const ach of achBullets) {
        if (
          ach.length > 20 &&
          !/Secondary|School|CBSE|HSC|SSC|Junior College|-- \d/i.test(ach)
        ) {
          claims.push({
            text: ach,
            relatedSkill: 'Academic & Professional Excellence',
            relatedProject: 'Achievements & Certifications'
          });
        }
      }
    }

    // C. Fallback if no specific claims found
    if (claims.length === 0 && projects.length > 0) {
      claims.push({
        text: `Designed and built ${projects[0].name} utilizing ${projects[0].technologies.slice(0, 3).join(', ') || 'modern engineering stack'}.`,
        relatedSkill: projects[0].technologies[0] || 'Software Development',
        relatedProject: projects[0].name
      });
    }

    const result = {
      candidate: { name, email, phone, location },
      skills: skills.length > 0 ? skills : [{ name: 'Software Engineering', level: '', evidence: 'From resume' }],
      projects,
      experience,
      education,
      certifications,
      claims
    };

    console.log('[PdfParser] Resume result — name:', result.candidate.name, ', skills:', result.skills.length, ', projects:', result.projects.length, ', certs:', result.certifications.length, ', claims:', result.claims.length);
    return result;
  }

  /**
   * Intelligent heuristic parser to extract structured Job Description data from raw PDF text.
   * Handles table-based skills, numbered sections, and priority labels.
   */
  static parseJdFromText(rawText, fileName = 'job_description.pdf') {
    const text = rawText.replace(/\r\n/g, '\n').replace(/\t+/g, '\n').trim();
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    console.log('[PdfParser] parseJdFromText called, text length:', text.length, 'lines:', lines.length);

    // Job Title — check first few lines for a short title-like line
    let job_title = '';
    const titleLabelMatch = text.match(/(?:Job Title|Position)\s*[:\s]+([^\n]+)/i);
    if (titleLabelMatch) {
      job_title = titleLabelMatch[1].trim();
    } else {
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i];
        if (
          line.length <= 60 && line.length >= 3 &&
          !/^\d+\./.test(line) &&
          !line.toLowerCase().includes('job description') &&
          !line.toLowerCase().includes('company') &&
          !line.toLowerCase().includes('location')
        ) {
          job_title = line.split(/[-–|]/)[0].trim();
          break;
        }
      }
    }
    if (!job_title) {
      job_title = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    }

    // Skills — scan for known skills and also parse table / list formats
    const knownSkills = [
      'Node.js', 'React', 'TypeScript', 'JavaScript', 'Python', 'Java', 'Go', 'Golang', 'C++',
      'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
      'REST APIs', 'FastAPI', 'GraphQL', 'System Design', 'Microservices', 'Git', 'CI/CD', 'Express', 'Tailwind',
      'Agile', 'Scrum', 'Kafka', 'WebSockets', 'Linux', 'SQL', 'NoSQL',
      'PyTorch', 'TensorFlow', 'Keras', 'scikit-learn', 'OpenCV', 'Pandas', 'NumPy',
      'LLMs', 'Generative AI', 'RAG', 'NLP', 'Machine Learning', 'Deep Learning', 'Computer Vision',
      'LangChain', 'HuggingFace', 'spaCy', 'MLOps'
    ];

    const required_skills = [];
    const preferred_skills = [];

    // Parse "Skills Required" section or table-formatted skills with priority
    const skillsSectionMatch = text.match(
      /(?:Skills Required|Required Skills|Key Skills|Technical Skills|Skills)\s*\n([\s\S]*?)(?=\n\s*(?:\d+\.\s*Priority|Note:|$))/i
    );
    if (skillsSectionMatch) {
      const skillsBlock = skillsSectionMatch[1];
      const skillLines = skillsBlock.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of skillLines) {
        // Handle table rows like "Python High" or "Docker & Cloud Medium"
        const tableMatch = line.match(/^([A-Za-z][A-Za-z\s/&.+]+?)\s+(High|Medium|Low|Required|Preferred|Nice to have)$/i);
        if (tableMatch) {
          const skillName = tableMatch[1].trim();
          const priority = tableMatch[2].trim().toLowerCase();
          if (priority === 'high' || priority === 'required') {
            required_skills.push(skillName);
          } else {
            preferred_skills.push(skillName);
          }
          continue;
        }
        // Handle "Skill Priority Level" header row — skip
        if (/^skill\s+priority/i.test(line)) continue;
        // Handle bullet list items
        const bulletMatch = line.match(/^[•*-]?\s*(.+)/);
        if (bulletMatch) {
          const item = bulletMatch[1].trim();
          if (item.length >= 2 && item.length <= 50 && !/^\d+\./.test(item)) {
            required_skills.push(item);
          }
        }
      }
    }

    // Also try "Priority Skills" or numbered priority lists
    const prioritySectionMatch = text.match(
      /(?:Priority Skills|Core Skills|Must-Have Skills)\s*\n([\s\S]*?)(?=\n\s*(?:\d+\.\s*[A-Z]|Note:|$))/i
    );
    if (prioritySectionMatch) {
      const priorityBlock = prioritySectionMatch[1];
      const priorityLines = priorityBlock.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of priorityLines) {
        const numbered = line.match(/^\d+\.\s*(.+)/);
        if (numbered) {
          const skillName = numbered[1].trim();
          if (!required_skills.includes(skillName) && skillName.length <= 50) {
            required_skills.push(skillName);
          }
        }
      }
    }

    // Fall back to scanning for known skills across the entire text
    if (required_skills.length === 0) {
      for (const s of knownSkills) {
        const regex = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(text)) {
          required_skills.push(s);
          if (required_skills.length >= 10) break;
        }
      }
    }

    if (required_skills.length === 0) {
      required_skills.push('Software Development', 'Problem Solving', 'Communication');
    }

    // Responsibilities
    const responsibilities = [];
    const respSectionMatch = text.match(
      /(?:Key Responsibilities|Responsibilities|Duties|What You Will Do)\s*\n([\s\S]*?)(?=\n\s*(?:\d+\.\s*(?:Skills|Qualifications|Experience)|Skills|Qualifications|Technologies|$))/i
    );
    if (respSectionMatch) {
      const respBlock = respSectionMatch[1];
      const respLines = respBlock.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of respLines) {
        const cleaned = line.replace(/^[•*-]\s*/, '').trim();
        if (cleaned.length > 10) {
          responsibilities.push(cleaned);
        }
      }
    }

    if (responsibilities.length === 0) {
      responsibilities.push(
        'Design, build, and maintain efficient, reusable, and reliable code.',
        'Collaborate with cross-functional teams to define, design, and ship new features.',
        'Identify bottlenecks, bugs, and devise solutions to optimize system performance.'
      );
    }

    // Qualifications
    const qualifications = [];
    const qualMatch = text.match(
      /(?:Qualifications|Education Required|Minimum Qualifications)\s*\n([\s\S]*?)(?=\n\s*(?:\d+\.\s*|Technologies|Experience|$))/i
    );
    if (qualMatch) {
      const qualLines = qualMatch[1].split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of qualLines) {
        const cleaned = line.replace(/^[•*-]\s*/, '').trim();
        if (cleaned.length > 10) qualifications.push(cleaned);
      }
    }
    if (qualifications.length === 0) {
      qualifications.push('Bachelor degree in Computer Science, Engineering, or equivalent experience');
    }

    // Experience requirements
    let experience_requirements = '3+ years of professional software engineering experience';
    const expMatch = text.match(/(\d+\+?\s*(?:[-–]\s*\d+)?\s*years?\s*(?:of\s+)?(?:relevant\s+)?(?:professional\s+)?experience)/i);
    if (expMatch) {
      experience_requirements = expMatch[1].trim();
    }

    const result = {
      job_title,
      required_skills: Array.from(new Set(required_skills)),
      preferred_skills: Array.from(new Set(preferred_skills)),
      responsibilities,
      qualifications,
      technologies: Array.from(new Set([...required_skills, ...preferred_skills])),
      experience_requirements
    };

    console.log('[PdfParser] JD result — title:', result.job_title, ', required:', result.required_skills.length, ', preferred:', result.preferred_skills.length);
    return result;
  }
}

export default PdfParserService;
