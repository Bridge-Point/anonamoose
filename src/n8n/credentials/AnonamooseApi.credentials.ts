import {
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class AnonamooseApi implements ICredentialType {
  name = 'anonamooseApi';
  displayName = 'Anonamoose API';
  documentationUrl = 'https://github.com/anonamoose/anonamoose';
  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'http://localhost:3100',
      placeholder: 'http://localhost:3000',
    },
    {
      displayName: 'API Token',
      name: 'apiToken',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
    },
  ];
}
