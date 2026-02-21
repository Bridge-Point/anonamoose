import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
} from 'n8n-workflow';

export class Anonamoose implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Anonamoose',
    name: 'anonamoose',
    icon: 'file:anonamoose.svg',
    group: ['transform'],
    version: 1,
    description: 'Redact and rehydrate PII from LLM interactions',
    defaults: {
      name: 'Anonamoose',
    },
    credentials: [
      {
        name: 'anonamooseApi',
        required: true,
      },
    ],
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          {
            name: 'Redact Text',
            value: 'redact',
            description: 'Redact PII from text',
          },
          {
            name: 'Hydrate Text',
            value: 'hydrate',
            description: 'Restore redacted text to original',
          },
          {
            name: 'Add Dictionary Entry',
            value: 'dictionaryAdd',
            description: 'Add terms to guaranteed redaction dictionary',
          },
          {
            name: 'List Dictionary',
            value: 'dictionaryList',
            description: 'List all dictionary entries',
          },
          {
            name: 'Proxy Request',
            value: 'proxy',
            description: 'Forward request through anonymization proxy',
          },
          {
            name: 'Get Stats',
            value: 'stats',
            description: 'Get redaction statistics',
          },
        ],
        default: 'redact',
      },
      {
        displayName: 'Text',
        name: 'text',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['redact', 'hydrate'],
          },
        },
        default: '',
        description: 'The text to redact or hydrate',
      },
      {
        displayName: 'Session ID',
        name: 'sessionId',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['hydrate'],
          },
        },
        default: '',
        placeholder: 'session-123',
        description: 'The session ID for rehydration',
      },
      {
        displayName: 'Dictionary Terms',
        name: 'terms',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['dictionaryAdd'],
          },
        },
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'Project Apollo\nJohn Smith\nACME Corp',
        description: 'One term per line',
      },
      {
        displayName: 'Case Sensitive',
        name: 'caseSensitive',
        type: 'boolean',
        displayOptions: {
          show: {
            operation: ['dictionaryAdd'],
          },
        },
        default: false,
      },
      {
        displayName: 'Whole Word Only',
        name: 'wholeWord',
        type: 'boolean',
        displayOptions: {
          show: {
            operation: ['dictionaryAdd'],
          },
        },
        default: false,
      },
      {
        displayName: 'Request Body (JSON)',
        name: 'requestBody',
        type: 'json',
        displayOptions: {
          show: {
            operation: ['proxy'],
          },
        },
        default: '{}',
        description: 'JSON body to send to the proxy',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials('anonamooseApi');
    const baseUrl = credentials.baseUrl as string;
    const apiToken = credentials.apiToken as string;

    const headers = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };

    for (let i = 0; i < items.length; i++) {
      try {
        const operation = this.getNodeParameter('operation', i) as string;
        let result: IDataObject = {};

        switch (operation) {
          case 'redact': {
            const text = this.getNodeParameter('text', i) as string;
            const response = await this.helpers.request({
              method: 'POST',
              url: `${baseUrl}/api/v1/redact`,
              body: { text },
              headers,
            });
            result = JSON.parse(response.toString());
            break;
          }

          case 'hydrate': {
            const text = this.getNodeParameter('text', i) as string;
            const sessionId = this.getNodeParameter('sessionId', i) as string;
            const response = await this.helpers.request({
              method: 'POST',
              url: `${baseUrl}/api/v1/sessions/${sessionId}/hydrate`,
              body: { text },
              headers,
            });
            result = JSON.parse(response.toString());
            break;
          }

          case 'dictionaryAdd': {
            const terms = this.getNodeParameter('terms', i) as string;
            const caseSensitive = this.getNodeParameter('caseSensitive', i) as boolean;
            const wholeWord = this.getNodeParameter('wholeWord', i) as boolean;

            const entries = terms.split('\n').filter(t => t.trim()).map(term => ({
              term: term.trim(),
              caseSensitive,
              wholeWord,
              enabled: true,
            }));

            const response = await this.helpers.request({
              method: 'POST',
              url: `${baseUrl}/api/v1/dictionary`,
              body: { entries },
              headers,
            });
            result = JSON.parse(response.toString());
            break;
          }

          case 'dictionaryList': {
            const response = await this.helpers.request({
              method: 'GET',
              url: `${baseUrl}/api/v1/dictionary`,
              headers,
            });
            result = JSON.parse(response.toString());
            break;
          }

          case 'stats': {
            const response = await this.helpers.request({
              method: 'GET',
              url: `${baseUrl}/api/v1/stats`,
              headers,
            });
            result = JSON.parse(response.toString());
            break;
          }

          case 'proxy': {
            const requestBody = this.getNodeParameter('requestBody', i) as object;
            const response = await this.helpers.request({
              method: 'POST',
              url: `${baseUrl}/v1/chat/completions`,
              body: requestBody,
              headers: {
                ...headers,
                'x-anonamoose-redact': 'true',
                'x-anonamoose-hydrate': 'true',
              },
            });
            result = JSON.parse(response.toString());
            break;
          }
        }

        returnData.push({ json: result });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message } });
        } else {
          throw error;
        }
      }
    }

    return [returnData];
  }
}
