import { Hono } from 'hono';
import { marked } from 'marked';
import { promises as fs } from 'fs';
import path from 'path';
import { PUBLIC_BASE_URL } from '../constants';

const faq = new Hono();

// Function to convert a title to a URL-friendly slug
const toSlug = (title: string) => {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-'); // Replace multiple hyphens with a single one
};

// Helper to extract plain text from markdown for meta description
const extractPlainText = (markdown: string, maxLength: number = 155): string => {
    return markdown
        .replace(/#{1,6}\s/g, '') // Remove headers
        .replace(/\*\*|__/g, '') // Remove bold
        .replace(/\*|_/g, '') // Remove italic
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace links with text
        .replace(/`{1,3}[^`]*`{1,3}/g, '') // Remove code blocks
        .replace(/\n+/g, ' ') // Replace newlines with spaces
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()
        .substring(0, maxLength)
        .trim() + (markdown.length > maxLength ? '...' : '');
};

// Helper to escape HTML for JSON-LD
const escapeForJsonLd = (text: string): string => {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
};

// Parse all FAQ sections from markdown
const parseFaqSections = (markdownContent: string) => {
    const sections = markdownContent.split(/^##\s/m);
    const titleMatch = markdownContent.match(/^#\s(.*)/);
    const pageTitle = titleMatch && titleMatch[1] ? titleMatch[1] : 'FAQ';

    const faqs: { title: string; slug: string; content: string }[] = [];

    for (const section of sections) {
        if (!section.trim()) continue;

        const lines = section.split('\n');
        if (!lines[0]) continue;
        const currentTitle = lines[0].trim();
        const currentSlug = toSlug(currentTitle);
        const content = lines.slice(1).join('\n').trim();

        if (currentTitle && content) {
            faqs.push({ title: currentTitle, slug: currentSlug, content });
        }
    }

    return { pageTitle, faqs };
};

// FAQ Index Page - lists all FAQs
faq.get('/', async (c) => {
    const faqPath = path.join(process.cwd(), 'src', 'faq', 'faq.md');

    try {
        const markdownContent = await fs.readFile(faqPath, 'utf-8');
        const { pageTitle, faqs } = parseFaqSections(markdownContent);

        // Generate JSON-LD with all FAQs
        const jsonLd = {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": faqs.map(faq => ({
                "@type": "Question",
                "name": faq.title,
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": extractPlainText(faq.content, 500)
                }
            }))
        };

        // Generate FAQ list HTML
        const faqListHtml = faqs.map(f =>
            `<li><a href="/api/faq/${f.slug}">${f.title}</a></li>`
        ).join('\n                            ');

        const metaDescription = `Frequently Asked Questions about Erobb221. ${faqs.length} questions answered including topics like gaming, streaming, and more.`;

        const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle} - Erobb221</title>
    <meta name="description" content="${metaDescription}">
    <link rel="canonical" href="${PUBLIC_BASE_URL}/api/faq">
    <link rel="stylesheet" href="/styles/style.css">
    <link rel="stylesheet" href="/styles/cs16.css">
    <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
    </script>
    <style>
        body {
            background-color: #1a1a1a;
            color: #f0f0f0;
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            padding: 2rem;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: #2c2c2c;
            padding: 2rem;
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }
        h1 {
            color: var(--primary-color);
            border-bottom: 2px solid var(--primary-color);
            padding-bottom: 0.5rem;
        }
        ul {
            list-style-type: none;
            padding: 0;
        }
        li {
            margin: 0.75rem 0;
            padding: 0.5rem;
            background-color: #3a3a3a;
            border-radius: 4px;
            transition: background-color 0.2s;
        }
        li:hover {
            background-color: #4a4a4a;
        }
        a {
            color: var(--primary-color);
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .faq-count {
            color: #888;
            font-size: 0.9rem;
            margin-bottom: 1.5rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${pageTitle}</h1>
        <p class="faq-count">${faqs.length} questions answered</p>
        <ul>
            ${faqListHtml}
        </ul>
    </div>
</body>
</html>
        `;
        return c.html(fullHtml);
    } catch (error) {
        console.error('Error reading or parsing FAQ file:', error);
        return c.text('Could not load FAQ.', 500);
    }
});

// Individual FAQ Page
faq.get('/:slug', async (c) => {
    const { slug } = c.req.param();
    const faqPath = path.join(process.cwd(), 'src', 'faq', 'faq.md');

    try {
        const markdownContent = await fs.readFile(faqPath, 'utf-8');
        const { pageTitle, faqs } = parseFaqSections(markdownContent);

        const foundFaq = faqs.find(f => f.slug === slug);

        if (foundFaq) {
            let htmlContent: string | null = null;
            try {
                const markedResult = marked(foundFaq.content);
                if (typeof markedResult === 'string') {
                    htmlContent = markedResult;
                } else {
                    htmlContent = await markedResult;
                }
            } catch (err) {
                console.error('Markdown parsing error:', err);
            }

            if (htmlContent) {
                // Generate meta description from content
                const metaDescription = extractPlainText(foundFaq.content, 155);

                // Generate JSON-LD FAQPage schema
                const jsonLd = {
                    "@context": "https://schema.org",
                    "@type": "FAQPage",
                    "mainEntity": [{
                        "@type": "Question",
                        "name": foundFaq.title,
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": extractPlainText(foundFaq.content, 1000)
                        }
                    }]
                };

                const canonicalUrl = `${PUBLIC_BASE_URL}/api/faq/${slug}`;

                const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${foundFaq.title} - ${pageTitle}</title>
    <meta name="description" content="${metaDescription}">
    <link rel="canonical" href="${canonicalUrl}">
    <link rel="stylesheet" href="/styles/style.css">
    <link rel="stylesheet" href="/styles/cs16.css">
    <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
    </script>
    <style>
        body {
            background-color: #1a1a1a;
            color: #f0f0f0;
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            padding: 2rem;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: #2c2c2c;
            padding: 2rem;
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }
        h1 {
            color: var(--primary-color);
            border-bottom: 2px solid var(--primary-color);
            padding-bottom: 0.5rem;
        }
        .back-link {
            display: inline-block;
            margin-bottom: 1rem;
            color: var(--primary-color);
            text-decoration: none;
        }
        .back-link:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/api/faq" class="back-link">&larr; Back to all FAQs</a>
        <h1>${foundFaq.title}</h1>
        <div>${htmlContent}</div>
    </div>
</body>
</html>
                `;
                return c.html(fullHtml);
            } else {
                return c.text('Error converting Markdown to HTML.', 500);
            }
        } else {
            return c.text('FAQ section not found.', 404);
        }
    } catch (error) {
        console.error('Error reading or parsing FAQ file:', error);
        return c.text('Could not load FAQ.', 500);
    }
});

export default faq;
