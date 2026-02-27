import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.anonamoose.net',
  integrations: [
    starlight({
      title: 'Anonamoose',
      description: 'LLM Anonymization Proxy — Guaranteed PII Redaction with Rehydration',
      social: {
        github: 'https://github.com/Bridge-Point/anonamoose',
      },
      editLink: {
        baseUrl: 'https://github.com/Bridge-Point/anonamoose/edit/main/docs/',
      },
      lastUpdated: true,
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Start Here',
          items: [
            { label: 'What is Anonamoose?', slug: 'what-is-anonamoose' },
            { label: 'Getting Started', slug: 'getting-started' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Installation', slug: 'guides/installation' },
            { label: 'Configuration', slug: 'guides/configuration' },
            { label: 'Dictionary', slug: 'guides/dictionary' },
            { label: 'Proxy Usage', slug: 'guides/proxy' },
            { label: 'Sessions', slug: 'guides/sessions' },
            { label: 'Deployment', slug: 'guides/deployment' },
            { label: 'Dashboard & Admin', slug: 'guides/dashboard' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'API', slug: 'reference/api' },
            { label: 'Environment Variables', slug: 'reference/environment-variables' },
            { label: 'PII Patterns', slug: 'reference/pii-patterns' },
            { label: 'n8n Integration', slug: 'reference/n8n' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'How It Works', slug: 'concepts/how-it-works' },
            { label: 'Four-Layer Pipeline', slug: 'concepts/three-layer-pipeline' },
            { label: 'Tokenization', slug: 'concepts/tokenization' },
            { label: 'Presidio Comparison', slug: 'concepts/presidio-comparison' },
          ],
        },
        {
          label: 'Compliance',
          items: [
            { label: 'Overview', slug: 'compliance/overview' },
            { label: 'HIPAA', slug: 'compliance/hipaa' },
            { label: 'GDPR', slug: 'compliance/gdpr' },
            { label: 'SOC 2', slug: 'compliance/soc2' },
            { label: 'ISO 27001', slug: 'compliance/iso27001' },
          ],
        },
      ],
    }),
  ],
});
