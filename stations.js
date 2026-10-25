// Rádios fixas. `url` é o stream HTTPS; `uuid` é o id na Radio Browser,
// usado como plano B se o link principal parar de funcionar.
// `region` define a seção da tela (RJ aparece primeiro).
const STW = 'https://playerservices.streamtheworld.com/api/livestream-redirect/';

const REGIONS = [
  { id: 'RJ', title: 'Rio de Janeiro' },
  { id: 'SP', title: 'São Paulo' },
];

const PRESETS = [
  // ---------- Rio de Janeiro: notícias e esporte ----------
  { id: 'cbn-rj', region: 'RJ', name: 'CBN Rio', sub: '92.5 · Notícias', short: 'CBN', color: '#991b1b',
    url: STW + 'CBN_RJAAC.aac', uuid: '8c2922b9-b375-4a3d-97dd-7f8fa8d09512' },
  { id: 'bandnews-rj', region: 'RJ', name: 'BandNews FM Rio', sub: '90.3 · Notícias', short: 'BN', color: '#5b21b6',
    url: STW + 'BANDNEWSFM_RJAAC.aac', uuid: '9c16f0b1-7764-4264-8d33-68f3566c68ef' },
  { id: 'globo', region: 'RJ', name: 'Rádio Globo', sub: '98.1 · Esporte e notícias', short: 'G', color: '#0369a1',
    url: STW + 'RADIO_GLOBO_RJAAC.aac', uuid: '1eaf6810-41de-4a43-827b-dcf8070748e5' },
  { id: 'tupi', region: 'RJ', name: 'Super Rádio Tupi', sub: '96.5 · Esporte e notícias', short: 'TUPI', color: '#b91c1c',
    url: 'https://8923.brasilstream.com.br/stream', uuid: '84a51775-4137-48c8-b72b-85f4b5edc7e5' },
  { id: 'nacional-rj', region: 'RJ', name: 'Rádio Nacional', sub: 'Rio de Janeiro', short: 'NAC', color: '#166534',
    url: 'https://radionacionalrio-stream.ebc.com.br/ebc/radionacionalriodejaneiro/playlist.m3u8',
    uuid: '0f60e584-d0fd-42ca-bc27-8082df7e6ff6' },
  { id: 'roquette', region: 'RJ', name: 'Roquette Pinto', sub: 'Rádio pública · RJ', short: 'RP', color: '#0f766e',
    url: 'https://radio.saopaulo01.com.br/8300/stream/', uuid: 'd35c9122-e7e6-4d2a-94d0-966fb14a28b5' },
  // ---------- Rio de Janeiro: música ----------
  { id: 'jbfm', region: 'RJ', name: 'JB FM', sub: '99.9 · Rio de Janeiro', short: 'JB', color: '#1d4ed8',
    url: STW + 'JBFMAAC.aac', uuid: 'bf97c7e7-a960-4ddc-8832-0def9e6d603f' },
  { id: 'melodia', region: 'RJ', name: 'Melodia FM', sub: '97.5 · Rio de Janeiro', short: 'M', color: '#7c2d12',
    url: STW + 'MELODIAFMAAC.aac', uuid: '12c34710-3f54-4834-b9c4-60b7deebf888' },
  { id: 'mixrio', region: 'RJ', name: 'Mix Rio', sub: '102.1 · Rio de Janeiro', short: 'MIX', color: '#db2777',
    url: STW + 'MIXRIOAAC.aac', uuid: '96487106-0601-11e8-ae97-52543be04c81' },
  { id: 'novabrasil-rj', region: 'RJ', name: 'Nova Brasil', sub: '89.5 · Rio de Janeiro', short: 'NB', color: '#ca8a04',
    url: STW + 'NOVABRASIL_RIOAAC.aac', uuid: 'cd2aedbd-acca-453b-a7cb-b1d6075dfd22' },
  { id: 'cidade', region: 'RJ', name: 'Rádio Cidade', sub: '102.9 · Rio de Janeiro', short: 'C', color: '#3f3f46',
    url: STW + 'RADIOCIDADEAAC.aac', uuid: '06da0d92-28c2-11e9-a80b-52543be04c81' },
  { id: '93fm', region: 'RJ', name: '93 FM', sub: 'Rio de Janeiro', short: '93', color: '#0891b2',
    url: STW + 'FM93AAC.aac', uuid: '2caa092a-68c0-46db-a32a-9317e36b1ca0' },
  { id: 'bandfm-rj', region: 'RJ', name: 'Band FM Rio', sub: 'Rio de Janeiro', short: 'B', color: '#b45309',
    url: STW + 'BANDFM_RJAAC.aac' },
  { id: 'transamerica-rj', region: 'RJ', name: 'Transamérica Rio', sub: 'Rio de Janeiro', short: 'T', color: '#ea580c',
    url: STW + 'RT_RJAAC.aac' },

  // ---------- São Paulo ----------
  { id: 'jp-news', region: 'SP', name: 'Jovem Pan News', sub: 'São Paulo', short: 'JP', color: '#1e40af',
    url: 'https://stream.zeno.fm/vlcraijc6yiuv', uuid: 'c7f6caca-5eb8-418e-a7f1-d52e7ff41926' },
  { id: 'jp-fm', region: 'SP', name: 'Jovem Pan FM', sub: '100.9 · São Paulo', short: 'JP', color: '#0284c7',
    url: 'https://stream.zeno.fm/c45wbq2us3buv', uuid: '8e9b5ba4-dcc1-4dad-8ddf-e7cc04c33a00' },
  { id: 'cbn-sp', region: 'SP', name: 'CBN', sub: '90.5 · São Paulo', short: 'CBN', color: '#dc2626',
    url: STW + 'CBN_SPAAC.aac', uuid: '52994d67-31ea-448f-b6bc-7eaeb6a3504b' },
  { id: 'bandnews-sp', region: 'SP', name: 'BandNews FM', sub: '96.9 · São Paulo', short: 'BN', color: '#7c3aed',
    url: STW + 'BANDNEWSFM_SPAAC.aac', uuid: '4a17b7fa-42a0-4c32-bdc6-dc1c59066c96' },
  { id: 'antena1', region: 'SP', name: 'Antena 1', sub: '94.7 · São Paulo', short: 'A1', color: '#0e7490',
    url: 'https://antenaone.crossradio.com.br/stream/1', uuid: '570cc99a-9159-4d91-9a8f-96ddb5b30797' },
  { id: 'transamerica', region: 'SP', name: 'Transamérica', sub: '100.1 · São Paulo', short: 'T', color: '#ea580c',
    url: STW + 'RT_SPAAC.aac', uuid: '6da066a5-eddf-4640-8bfb-25070c52858d' },
  { id: 'mix', region: 'SP', name: 'Mix FM', sub: '106.3 · São Paulo', short: 'MIX', color: '#db2777',
    url: STW + 'MIXFM_SAOPAULOAAC.aac', uuid: '61156199-ece3-413e-ac39-7b2483513ab2' },
  { id: 'kiss', region: 'SP', name: 'Kiss FM', sub: '92.5 · São Paulo', short: 'KISS', color: '#be123c',
    url: STW + 'RADIO_KISSFM_ADP.aac', uuid: '2442fea9-64ca-4a6d-a942-8abfd7cb42f5' },
  { id: 'alpha', region: 'SP', name: 'Alpha FM', sub: '101.7 · São Paulo', short: 'α', color: '#a16207',
    url: STW + 'RADIO_ALPHAFM_ADP.aac', uuid: '447a1a5f-aee6-4b21-b85f-10ceb1896ad3' },
  { id: 'nativa', region: 'SP', name: 'Nativa FM', sub: '95.3 · São Paulo', short: 'N', color: '#15803d',
    url: STW + 'NATIVA_SPAAC.aac', uuid: '8ff4695c-7266-4fc0-9a23-c84d0a51cb34' },
  { id: '89fm', region: 'SP', name: '89 FM A Rádio Rock', sub: '89.1 · São Paulo', short: '89', color: '#3f3f46',
    url: STW + 'RADIO_89FM_ADP.aac', uuid: 'be54b4d2-f3f6-45d5-b449-06adcaf36830' },
  { id: 'bandfm', region: 'SP', name: 'Band FM', sub: '96.1 · São Paulo', short: 'B', color: '#b45309',
    url: STW + 'BANDFM_SPAAC.aac', uuid: 'c8cfc213-6a39-4b45-b925-3c6acb3f8b68' },
];
