import {
  buildVersionRegistry,
  type VersionRegistry
} from '@officium-novum/rubrical-engine';

export function testVersionRegistry(): VersionRegistry {
  return buildVersionRegistry([
    {
      version: 'Tridentine - 1570',
      kalendar: 'Tridentine',
      transfer: 'Tridentine',
      stransfer: 'Tridentine'
    },
    {
      version: 'Tridentine - 1888',
      kalendar: 'Tridentine',
      transfer: 'Tridentine',
      stransfer: 'Tridentine'
    },
    {
      version: 'Tridentine - 1906',
      kalendar: 'Tridentine',
      transfer: 'Tridentine',
      stransfer: 'Tridentine'
    },
    {
      version: 'Divino Afflatu - 1939',
      kalendar: 'DA',
      transfer: 'DA',
      stransfer: 'DA'
    },
    {
      version: 'Divino Afflatu - 1954',
      kalendar: 'DA',
      transfer: 'DA',
      stransfer: 'DA',
      base: 'Divino Afflatu - 1939',
      transferBase: 'Divino Afflatu - 1939'
    },
    {
      version: 'Reduced - 1955',
      kalendar: 'Reduced',
      transfer: 'Reduced',
      stransfer: 'Reduced',
      base: 'Divino Afflatu - 1954'
    },
    {
      version: 'Rubrics 1960 - 1960',
      kalendar: '1960',
      transfer: '1960',
      stransfer: '1960',
      base: 'Reduced - 1955'
    },
    {
      version: 'Rubrics 1960 - 2020 USA',
      kalendar: '1960 USA',
      transfer: '1960',
      stransfer: '1960',
      base: 'Rubrics 1960 - 1960'
    },
    {
      version: 'Monastic Tridentinum 1617',
      kalendar: 'Monastic',
      transfer: 'Monastic',
      stransfer: 'Monastic'
    },
    {
      version: 'Monastic Divino 1930',
      kalendar: 'Monastic',
      transfer: 'Monastic',
      stransfer: 'Monastic'
    },
    {
      version: 'Monastic - 1963',
      kalendar: 'Monastic',
      transfer: 'Monastic',
      stransfer: 'Monastic'
    },
    {
      version: 'Monastic - 1963 - Barroux',
      kalendar: 'Monastic',
      transfer: 'Monastic',
      stransfer: 'Monastic'
    },
    {
      version: 'Monastic Tridentinum Cisterciensis 1951',
      kalendar: 'Cist',
      transfer: 'Cist',
      stransfer: 'Cist'
    },
    {
      version: 'Monastic Tridentinum Cisterciensis Altovadensis',
      kalendar: 'Cist',
      transfer: 'Cist',
      stransfer: 'Cist'
    },
    {
      version: 'Ordo Praedicatorum - 1962',
      kalendar: 'OP',
      transfer: 'OP',
      stransfer: 'OP'
    }
  ]);
}
