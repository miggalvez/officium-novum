import type { PublicComposedHourDto } from '../../api/types';
import { OfficeRenderer } from '../office/OfficeRenderer';

/**
 * A self-contained showcase route — renders representative breviary content
 * with the new Baronius-inspired styling, without needing the API. Mirrors
 * the sample page from the printed Roman Breviary (Item No. 5500), with
 * Latin/English parallel columns, ℣/℟ markers, deep-rubric text, and
 * centered small-caps section headings.
 */
export function PreviewPage(): JSX.Element {
  return (
    <article>
      <div className="office-toolbar" style={{ paddingBottom: 'var(--space-4)' }}>
        <p className="muted" style={{ fontStyle: 'italic' }}>
          Static preview — sample content rendered with the new breviary styles.
          The live Office route uses the API and looks the same.
        </p>
      </div>

      <div className="office">
        <header className="office__header">
          <h1>Ordinary of the Divine Office</h1>
          <p className="muted">According to the Roman Rite · Constant Part</p>
        </header>

        <OfficeRenderer
          office={SAMPLE_OFFICE}
          languages={['la', 'en']}
          displayMode="parallel"
          reviewerMode={false}
        />
      </div>
    </article>
  );
}

const SAMPLE_OFFICE: PublicComposedHourDto = {
  date: '2026-04-29',
  hour: 'matins',
  celebration: 'Feria',
  languages: ['la', 'en'],
  orthography: 'version',
  warnings: [],
  sections: [
    {
      type: 'rubric',
      slot: 'preface',
      languages: ['la', 'en'],
      lines: [
        {
          texts: {
            la: [
              { type: 'rubric', value: '1. ' },
              {
                type: 'text',
                value:
                  'Nisi alia indicatio in proprio loco detur, Officium Divinum, per totum annum et in omnibus Horis, dicitur secundum formam in rubricis hujus Ordinarii datam.'
              }
            ],
            en: [
              { type: 'rubric', value: '1. ' },
              {
                type: 'text',
                value:
                  'Unless some other indication is given in its proper place, the Divine Office is said, during the whole year and at all the Hours, according to the form given in the rubrics of this Ordinary.'
              }
            ]
          }
        }
      ]
    },
    {
      type: 'heading',
      slot: 'matins',
      languages: ['la', 'en'],
      lines: []
    },
    {
      type: 'rubric',
      slot: 'matins-opening',
      languages: ['la', 'en'],
      lines: [
        {
          texts: {
            la: [
              { type: 'rubric', value: '2. ' },
              { type: 'text', value: 'Matutinum directe incipitur a versu' }
            ],
            en: [
              { type: 'rubric', value: '2. ' },
              { type: 'text', value: 'Matins is begun directly with the verse' }
            ]
          }
        },
        {
          marker: 'V',
          texts: {
            la: [{ type: 'text', value: 'Dómine, lábia mea apéries.' }],
            en: [{ type: 'text', value: 'O Lord, open my lips.' }]
          }
        },
        {
          marker: 'R',
          texts: {
            la: [{ type: 'text', value: 'Et os meum annuntiábit laudem tuam.' }],
            en: [{ type: 'text', value: 'And my mouth shall proclaim Your praise.' }]
          }
        },
        {
          marker: 'V',
          texts: {
            la: [{ type: 'text', value: 'Deus, in adiutórium meum inténde.' }],
            en: [{ type: 'text', value: 'O God, come to my assistance.' }]
          }
        },
        {
          marker: 'R',
          texts: {
            la: [{ type: 'text', value: 'Dómine, ad adiuvándum me festína.' }],
            en: [{ type: 'text', value: 'O Lord, make haste to help me.' }]
          }
        },
        {
          texts: {
            la: [
              {
                type: 'text',
                value:
                  'Glória Patri, et Fílio, et Spirítui Sancto. Sicut erat in princípio, et nunc, et semper, et in sǽcula sæculórum. Amen. Allelúia.'
              }
            ],
            en: [
              {
                type: 'text',
                value:
                  'Glory be to the Father and to the Son and to the Holy Spirit. As it was in the beginning, is now and ever shall be, world without end. Amen. Alleluia.'
              }
            ]
          }
        },
        {
          texts: {
            la: [
              { type: 'rubric', value: 'Allelúia ' },
              {
                type: 'text',
                value:
                  'dicitur eo modo per omnes Horas, toto anno, exceptis a Completorio Sabbati ante Dominicam Septuagesimæ usque ad Completorium Feriæ IV in Hebdomada Sancta; tunc loco eius dicitur'
              }
            ],
            en: [
              { type: 'rubric', value: 'Alleluia ' },
              {
                type: 'text',
                value:
                  'is said in this way at all the Hours, throughout the year, except from Compline of the Saturday before Septuagesima Sunday to Compline of Wednesday in Holy Week; then it is replaced by'
              }
            ]
          }
        },
        {
          texts: {
            la: [{ type: 'text', value: 'Laus tibi, Dómine, Rex ætérnæ glóriæ.' }],
            en: [{ type: 'text', value: 'Praise be to You, Lord, King of eternal glory.' }]
          }
        }
      ]
    },
    {
      type: 'rubric',
      slot: 'invitatory',
      languages: ['la', 'en'],
      lines: [
        {
          texts: {
            la: [
              { type: 'rubric', value: '3. ' },
              {
                type: 'text',
                value:
                  'Deinde dicitur Invitatorium proprium. Ante psalmum totum Invitatorium bis recitatur. Inter versus psalmi alternatim repetuntur totum Invitatorium et pars post asteriscum *, ut infra notatur.'
              }
            ],
            en: [
              { type: 'rubric', value: '3. ' },
              {
                type: 'text',
                value:
                  'Next the proper invitatory is said. Before the psalm the whole invitatory is recited twice. Between verses of the psalm the whole invitatory and the part after the asterisk * are repeated alternately, as indicated below.'
              }
            ]
          }
        }
      ]
    },
    {
      type: 'psalm',
      slot: 'invitatory-psalm',
      languages: ['la', 'en'],
      heading: { kind: 'lesson', ordinal: 94 },
      lines: [
        {
          texts: {
            la: [
              {
                type: 'text',
                value:
                  'Veníte, exsultémus Dómino, iubilémus Deo, salutári nostro: præoccupémus fáciem eius in confessióne, et in psalmis iubilémus ei.'
              }
            ],
            en: [
              {
                type: 'text',
                value:
                  'Come, let us praise the Lord with joy; let us joyfully sing to God our Saviour. Let us come before His presence with thanksgiving, and with psalms let us sing our joy to Him.'
              }
            ]
          }
        },
        {
          texts: {
            la: [{ type: 'rubric', value: 'Repetitur totum Invitatorium.' }],
            en: [{ type: 'rubric', value: 'The whole invitatory is repeated.' }]
          }
        },
        {
          texts: {
            la: [
              {
                type: 'text',
                value:
                  'Quóniam Deus magnus Dóminus, et Rex magnus super omnes deos: quóniam non repéllet Dóminus plebem suam: quia in manu eius sunt omnes fines terræ, et altitúdines móntium ipse cónspicit.'
              }
            ],
            en: [
              {
                type: 'text',
                value:
                  'For the Lord is a great God, and a great King above all gods; for the Lord will not cast off His people. In His hand are all the ends of the earth, and He looks down on the mountaintops.'
              }
            ]
          }
        },
        {
          texts: {
            la: [{ type: 'rubric', value: 'Repetitur secunda pars Invitatorii.' }],
            en: [{ type: 'rubric', value: 'The second part of the invitatory is repeated.' }]
          }
        },
        {
          texts: {
            la: [
              { type: 'rubric', value: '¶ ' },
              {
                type: 'rubric',
                value:
                  'In sequenti versu psalmi genuflectitur ad verba Veníte, adorémus, et procidámus ante Deum.'
              }
            ],
            en: [
              { type: 'rubric', value: '¶ ' },
              {
                type: 'rubric',
                value:
                  'In the following verse of the psalm a genuflection is made at the words Come, let us adore and bow down before God.'
              }
            ]
          }
        },
        {
          texts: {
            la: [
              {
                type: 'text',
                value:
                  'Quóniam ipsíus est mare, et ipse fecit illud, et áridam fundavérunt manus eius: VENÍTE, ADORÉMUS, ET PROCIDÁMUS ANTE DEUM: plorémus coram Dómino, qui fecit nos, quia ipse est Dóminus Deus noster; nos autem pópulus eius, et oves páscuæ eius.'
              }
            ],
            en: [
              {
                type: 'text',
                value:
                  'For His is the sea, and He made it; and His hands formed the dry land. COME, LET US ADORE AND BOW DOWN BEFORE GOD. Let us weep before the Lord who made us; for He is the Lord our God, and we are His people and the sheep of His pasture.'
              }
            ]
          }
        },
        {
          texts: {
            la: [{ type: 'rubric', value: 'Repetitur totum Invitatorium.' }],
            en: [{ type: 'rubric', value: 'The whole invitatory is repeated.' }]
          }
        },
        {
          texts: {
            la: [
              {
                type: 'text',
                value:
                  'Hódie, si vocem eius audiéritis, nolíte obduráre corda vestra, sicut in exacerbatióne secúndum diem tentatiónis in desérto: ubi tentavérunt me patres vestri, probavérunt et vidérunt ópera mea.'
              },
              { type: 'citation', value: '(Ps 94, 8-9)' }
            ],
            en: [
              {
                type: 'text',
                value:
                  'Today if you hear His voice, do not harden your hearts, as in the provocation that was offered when the day of temptation came in the wilderness, where your fathers tempted Me: they tested Me, though they had seen My works.'
              },
              { type: 'citation', value: '(Ps 94:8–9)' }
            ]
          }
        }
      ]
    }
  ]
};
