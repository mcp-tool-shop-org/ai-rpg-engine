<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# एआई आरपीजी इंजन

नियतात्मक आरपीजी सिमुलेशन बनाने के लिए एक टाइपस्क्रिप्ट टूलकिट। आप आँकड़े परिभाषित करते हैं, मॉड्यूल चुनते हैं, युद्ध प्रणाली को जोड़ते हैं और सामग्री बनाते हैं। इंजन स्थिति, घटनाओं, यादृच्छिक संख्या जनरेटर (आरएनजी), क्रिया समाधान और एआई निर्णय लेने का प्रबंधन करता है। प्रत्येक रन दोहराया जा सकता है।

यह एक **कंपोज़िशन इंजन** है, न कि कोई तैयार गेम। 10 शुरुआती दुनिया उदाहरण हैं - विघटनीय पैटर्न जिनसे आप सीखते हैं और उन्हें फिर से जोड़ते हैं। आपके गेम में इंजन के जो भी उपसमुच्चय की आवश्यकता होती है, उसका उपयोग किया जाता है।

---

## यह क्या है

- A **module library** — 30+ engine modules covering combat, perception, cognition, factions, rumors, traversal, companions, and more
- A **composition toolkit** — `buildCombatStack()` wires combat in ~7 lines; `new Engine({ modules })` boots the game
- A **simulation runtime** — deterministic ticks, replayable action logs, seeded RNG
- An **AI design studio** (optional) — scaffolding, critique, balance analysis, tuning, experiments via Ollama
- An **optional on-ledger layer** — `@ai-rpg-engine/ledger-adapter` backs a game's coin and tradeable items with real XRPL **testnet** tokens, settled at checkpoints, entirely outside the deterministic core (opt-in; a run is byte-identical without it)

## यह क्या नहीं है

- Not a single finished game — it ships 10 playable starter worlds you can `run` today as examples, and the engine is the toolkit you compose your *own* game from
- Not a visual engine — it outputs structured events, not pixels
- Not a story generator — it simulates worlds; narrative emerges from mechanics

---

## वर्तमान स्थिति (संस्करण 3.5.0)

**क्या काम करता है और इसका परीक्षण किया गया है:**

- कोर रनटाइम: विश्व स्थिति, घटनाएं, क्रियाएं, टिक, रीप्ले - v1.0 से स्थिर; नियतात्मक बाइट-समान रीप्ले (प्रति-उदाहरण आईडी काउंटर, सीडेड आरएनजी)
- मुकाबला प्रणाली: 5 क्रियाएं, 4 मुकाबला स्थितियां, 4 संलग्नता स्थितियां, साथी अवरोधन, हार प्रवाह, एआई रणनीति
- क्षमताएं: लागत, कूलडाउन, स्थिति जांच, टाइप की गई प्रभाव, 11-टैग स्थिति शब्दावली, एआई-जागरूक चयन
- **पार्टी मुकाबला (v2.4):** सहयोगी-लक्ष्यीकरण (उपचार / बफ़ / पुनर्जीवित), मित्र/शत्रु AoE फ़िल्टरिंग, लक्ष्य चयनकर्ता - एक चिकित्सक एक टीम के साथी का इलाज कर सकता है; दुश्मन AoE सहयोगियों को नहीं मारता
- **स्थिति प्रभाव (v2.4):** निष्क्रिय स्थिति संशोधक मुकाबला तक पहुंचते हैं, नियतात्मक DoT/HoT टिक काउंटर से हटकर, गहराई-सीमित प्रतिक्रियाशील ट्रिगर (कांटे / परावर्त)
- **प्लग-इन प्रोफाइल - प्रति-इकाई नियम समाधान (v2.5):** एक `might` योद्धा और एक `will` रहस्यवादी एक लड़ाई में मुकाबला करते हैं, प्रत्येक अपनी मैपिंग के माध्यम से आँकड़े पढ़ता है। `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` एक प्रोफ़ाइल संलग्न करता है (स्थिति मैपिंग, संसाधन पूल, प्रति-इकाई क्षमताएं); `buildProfile()`, `validateProfileSet()` (डुप्लिकेट आईडी अस्वीकृत), 10 स्टार्टर-व्युत्पन्न टेम्पलेट और एक `profile` CLI कमांड
- **चलाने योग्य `run` लूप (v2.6):** अंतिम गेम वास्तविक है, डेमो नहीं - दुश्मन अपनी एआई इरादे प्रोफाइल के अनुसार कार्य करते हैं (`aggressive`/`cautious`/`territorial`/`calculating`), एक लड़ाई जीत या हार में समाप्त होती है, आप सहेज सकते हैं और फिर से शुरू कर सकते हैं, और क्षमताएं और XP क्रिया मेनू पर होते हैं। `run <path>` आपके द्वारा बनाए गए गेम को लोड करता है। एक नज़र में देखने योग्य HUD और सुलभ रंग के साथ कंपोज़्ड टर्मिनल UI (`NO_COLOR` / गैर-TTY का सम्मान करता है)
- **एआई डिज़ाइन स्टूडियो अपने स्वयं के `ai` कमांड के रूप में शिप होता है (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat` - एक स्थानीय ओलामा मॉडल के खिलाफ सामग्री को स्केच करें, आलोचना करें और संतुलित करें
- एकीकृत निर्णय परत: मुकाबला + क्षमता स्कोरिंग एक कॉल में मर्ज हो जाती है (`selectBestAction`)
- सभी 11 स्टार्टर दुनिया `buildCombatStack()` का उपयोग करती हैं - सिद्ध रचना रीढ़
- प्रति-स्टार्टर एआई ट्यूनिंग के लिए कॉग्निशन कॉन्फ़िगर एपीआई (`cognition: CognitionCoreConfig | false`)
- सामग्री निर्माण के लिए टैग टैक्सोनॉमी और सत्यापन उपकरण
- **दुनिया प्रतिक्रिया करती है (v2.7):** हत्याएं गर्मी जमा करती हैं और जिले की सुरक्षा को कम करती हैं; प्रति-राउंड विश्व टिक छिपे हुए दबाव उत्पन्न करता है जो अफवाहों के रूप में सामने आते हैं ("फुसफुसाहटें आप तक पहुँचती हैं…"), बढ़ते हैं, और परिणामों के साथ समाप्त होते हैं; सभी 10 स्टार्टर में ज़ोन प्रविष्टि पर लगभग 30 निर्मित मुठभेड़ रचनाएं फायर होती हैं - प्रति-बीज नियतात्मक, अधिक खूनी जिले अधिक उत्पन्न करते हैं, बॉस सेट-पीस सुरक्षित
- **वापस लौटने का एक कारण (v2.7):** लंबे समय से शिप किए गए स्कीमा पर एक न्यूनतम खोज लूप - खोज ट्रिगर्स पर ऑफ़र करती है, हत्या/पहुंच/प्रगति उद्देश्यों को ट्रैक करती है, और XP और आइटम बिल्कुल एक बार देती है; चार निर्मित खोजें, एक **जर्नल** स्क्रीन, राउंड के वर्णन में खोज बीट्स
- **उपकरण मुकाबला तक पहुँचते हैं (v2.7):** `equip`/`unequip` वास्तविक संख्याएँ स्थिति परत से गुज़रती हैं जिसे मुकाबला सूत्र पहले से ही पढ़ते हैं - शून्य मुकाबला-कोड परिवर्तन; ग्लेडिएटर का त्रिशूल और जाल एक परीक्षण-पिन हिट-चांस डेल्टा के साथ अंत-से-अंत तक वायर्ड है
- **सीडेड रन (v2.7):** प्रत्येक ताज़ा सत्र अपने सटीक रीप्ले कमांड के साथ अपना बीज प्रिंट करता है; `--seed <n>` एक सत्र को बाइट-दर-बाइट पुन: उत्पन्न करता है; मुकाबला, प्रतिरोध, क्षमता और रणनीति रोल सभी विश्व बीज का उपयोग करते हैं - और अंत आपके द्वारा वास्तव में खेले गए रन को पढ़ते हैं (लाइव गर्मी, दबाव, गुट संचय, खिलाड़ी स्तर)
- **`buildWorldStack()` (v2.7):** `buildCombatStack()` के बगल में रणनीतिक रचना रीढ़ - एक कॉल पर्यावरण, गुटों, अफवाहों, जिलों, हार के परिणामों, मुठभेड़ों और खोजों को इकट्ठा करता है; साथ ही **निदेशक का लेज़र** रणनीति स्क्रीन, एक `AI_RPG_DEBUG=1` सिमुलेशन इंस्पेक्टर, `inspect-save` जो जारी रखें के समान अधिकारियों द्वारा गेट किया गया है, और शिप किए गए पुनर्स्थापना पथ पर एक मॉड्यूल सहेज-प्रवासन सीम
- **जीवित अर्थव्यवस्था पर कार्य करें (v2.8):** `createEconomyCore` पैक-लोड पर प्रति-जिला अर्थव्यवस्था को सीड करता है और इसे प्रत्येक दौर में टिक करता है; एक नया `sell` क्रिया मूल्य `computeItemValue` के माध्यम से लूट की कीमत निर्धारित करता है (दुर्लभता / गुट / उत्पत्ति / तस्करी) और स्थानीय आपूर्ति को बदल देता है। एक राइट-वायर पांच प्रणालियों को जलाता है जो v2.7 में अंधेरे में शिप किए गए थे - निदेशक का बाजार अवलोकन + गुट स्कोरिंग, अंतिम व्यापारी-राजकुमार चाप और पतन ट्रिगर, और चार अर्थव्यवस्था दबाव प्रकार। **इस चक्र में केवल बिक्री** (खरीद → v2.9)
- **साथी (v2.8):** एक `recruit` क्रिया एक पार्टी बनाती है - स्थिति, टैग और गुट, इसलिए एक साथी *आपके साथ* लड़ता है; साथी मुकाबला मुकाबला-कोर के अवरोधन तंत्र पर सवारी करता है (जब तक कि `isAlly` सेट नहीं हो जाता), साथी मनोबल के साथ प्रतिक्रिया करते हैं और प्रस्थान कर सकते हैं, और भर्ती सात प्रतीक्षा करने वाले उपभोक्ताओं को जलाती है - अंतिम COMPANIONS रोल-कॉल, पार्टी लक्ष्यीकरण, एनपीसी-एजेंसी लक्ष्य, पक्ष-खोजें, और निदेशक का PARTY अनुभाग। **इस चक्र में निष्क्रिय अवरोधन** (स्वतंत्र मोड़ → v2.9)
- **निदेशक पूरे बोर्ड को पढ़ता है (v2.8):** एक नया उपकरण लेज़र अनुभाग (cli→उपकरण उत्पत्ति निर्भरता के पीछे), एक DIRECTOR'S SUMMARY अंतिम ट्रेलर, बाजार अवलोकन + पार्टी अनुभाग अब लाइव उत्पादकों से खिलाया जाता है, और जिले की स्थिरता + अंतिम DISTRICTS अनुभाग में आर्थिक स्वर
- **अर्थव्यवस्था का दूसरा आधा भाग (v2.9):** एक `buy` क्रिया लूप को पूरा करती है - आपूर्ति-श्रेणी दाने पर प्रति-जिला व्यापारी स्टॉक की पेशकश की जाती है (आपूर्ति स्तर *पुनःपूर्ति संकेत है*), उसी `computeItemValue` पाइपलाइन के माध्यम से मूल्य निर्धारित किया जाता है जैसा कि `sell` प्लस एक खरीद/बिक्री प्रसार ताकि कोई जोखिम रहित राउंड-ट्रिप न हो। और क्राफ्टिंग जीवंत हो जाती है: `createCraftingCore` निर्मित नुस्खा तालिकाओं पर `salvage`/`craft`/`repair`/`modify` को पंजीकृत करता है, निदेशक के सामग्री + व्यंजनों अनुभागों को जलाता है जो अंधेरे में शिप किए गए थे
- **साथी अपने स्वयं के मोड़ लेते हैं (v2.9):** v2.8 से निष्क्रिय-अवरोधन फर्श छत बन जाता है - भर्ती किए गए साथी प्रत्येक दौर में पहले अप्रयुक्त `selectBestAction` सलाहकार के माध्यम से स्वतंत्र रूप से कार्य करते हैं, प्रति-भूमिका मुकाबला पूर्वाग्रह के साथ ताकि एक योद्धा और एक विद्वान अलग तरह से लड़ें, साथी-पर-साथी अवरोधन, और निदेशक के PARTY लाइन पर पार्टी HP। बिना साथियों वाले पैक बाइट-समान रहते हैं (खाली-पार्टी गेट विरासत रीप्ले को संरक्षित करता है)
- **सामाजिक परत, अंत-से-अंत तक जुड़ी हुई (v2.9):** चार लाभ क्रियाएं - `bribe`, `intimidate`, `petition`, `seed` (अफवाह) - वास्तविक प्रतिष्ठा / अलर्ट / गर्मी वैश्विक लिखते हैं जो पहले से ही व्यापार मूल्य निर्धारण और गुट गेट पढ़ते हैं, और `seed` पूरे खिलाड़ी-अफवाह मॉड्यूल को जलाता है + निदेशक का आपके बारे में अफवाह अनुभाग। उन्हें निधि देने वाली लाभ *अर्थव्यवस्था* भी वायर्ड है: एक अवसर को पूरा करने से अब वह लाभ मिलता है जिसकी उसने हमेशा घोषणा की थी, इसलिए क्रियाएं वास्तव में खेल में अर्जित की जा सकती हैं
- **अवसर, पूर्ण जीवन चक्र (v2.9):** एक प्रति-राउंड स्पॉर्नर अनुबंध / बाउंटी / पक्ष प्रदान करता है जो लाइव विश्व स्थिति के खिलाफ स्कोर किए जाते हैं; आप `accept`, फिर `complete` या `abandon`; इसकी समय सीमा तक किसी को अनदेखा करने से अब परिणाम होते हैं (समाप्ति का प्रभाव), और एक साथी पक्ष को पूरा करने से उस साथी का मनोबल बढ़ता है। अंतिम गेम के बढ़ते-शक्ति और व्यापारी-राजकुमार चापों में आपके द्वारा वास्तव में हल किए गए अवसरों को पढ़ा जाता है
- **सभी दस स्टार्टर में सामग्री समानता (v2.9):** उपकरण वायरिंग, खोजें, भर्ती योग्य साथी और एक शुरुआती सिक्का संतुलन हर उस स्टार्टर तक बढ़ाया गया जिसमें वे थे - अब सभी दस दुनिया सुविधाओं की एक समान, पूरी तरह से प्रकाशित सतह साझा करती हैं (उपकरण केवल ग्लेडिएटर थे; खोजें केवल फंतासी / ज़ोंबी थीं; पांच दुनिया `recruit` के साथ शिप की गईं जिनमें भर्ती करने के लिए कोई नहीं था)। साथ ही एक संरचनात्मक सामग्री सत्यापनकर्ता जो प्रत्येक संदर्भ सतह पर टाइप किए गए आइटम आईडी को पकड़ता है, और `--checkpoint`/`--list-checkpoints` के साथ बहु-चेकप्वाइंट सहेज स्लॉट
- **जीवित एनपीसी, वास्तव में जीवित (v3.0):** बने रहने वाले एनपीसी-एजेंसी निर्माता निदेशक के **लोग** अनुभाग को जलाता है - नामित एनपीसी (प्रति स्टार्टर एक निर्मित कहानी चरित्र, प्लस आपके द्वारा भर्ती किए गए प्रत्येक साथी) लक्ष्य, विश्वास / भय / लालच / वफादारी संबंध, दायित्व लेज़र और परिणाम श्रृंखला रखते हैं। `runNpcAgencyTick` प्रत्येक दौर में चलता है, गेट किया जाता है ताकि बिना किसी नामित एनपीसी वाली दुनिया विरासत रीप्ले के समान बाइट-समान रहे। निर्माता को जलाने से साथी पक्ष-पतन प्रस्थान ब्रेकप्वाइंट, दो निष्क्रिय अवसर स्पॉन नियम (एनपीसी-लक्ष्य + दायित्व) और अंतिम एनपीसी प्रोफाइल / एनपीसी दायित्व भी जल गए - तार का परीक्षण किया गया था हरा लेकिन शिप किए गए सामग्री में निष्क्रिय जब तक कि चरण-9 ऑडिट ने इसे पकड़ नहीं लिया, इसलिए फिक्स प्रत्येक स्टार्टर में एक निर्मित नामित एनपीसी को भेजता है
- **पूरी सामाजिक सतह (v3.0):** चार लाभ क्रियाएं पच्चीस हो जाती हैं - कूटनीति और तोड़फोड़ समूह पंजीकृत होते हैं (21 अधिक उप-क्रियाएं), पहले से अंधेरे `leverage-diplomacy` / `leverage-sabotage` साथी प्रतिक्रियाओं को जलाते हैं; उन्नीस क्रमांकित मेनू पर दिखाई देते हैं (किफायती + कूलडाउन + प्रतिष्ठा गेटेड)। संवाद स्थितियां और प्रभाव अब सामाजिक स्थिति (लाभ / प्रतिष्ठा / एनपीसी-संबंध) पढ़ते और लिखते हैं। और निष्क्रिय लाभ आय (`tickLeverage` / `computeLeverageGains`) प्रतिष्ठा से प्रभाव को टपकाती है और पक्ष / ब्लैकमेल / वैधता प्रदान करती है XP और मील के पत्थर से - इसलिए सामाजिक परत अवसरों के बीच कमाती है, न कि केवल पूर्ण होने पर
- **शैली-स्वाद वाली अर्थव्यवस्था (v3.0):** व्यापारी स्टॉक और क्राफ्टिंग व्यंजनों अब प्रति-स्टार्टर शैली तालिकाओं को हल करते हैं (दस स्टार्टर में से सात में निर्मित शैली सामग्री होती है; तीन सार्वभौमिक पर वापस आ जाते हैं) - खरीद / शिल्प यांत्रिकी, क्रमांकित मेनू प्रदर्शन और निदेशक के व्यंजनों अनुभाग में, सभी एक ही नियमसेट कुंजी से थ्रेडेड ताकि प्रदर्शन और यांत्रिकी सहमत हों। `repair` और `modify` अब क्रमांकित मेनू पंक्तियाँ हैं (आइटम × नुस्खा युग्मन), और `escort` अवसर एक सुरक्षात्मक-यात्रा-एक-खतरनाक-जिले के गेट पर उत्पन्न होते हैं
- **अंतिम गेम आपके द्वारा अर्जित लाभ को पढ़ता है (v3.0):** `victory`, `puppet-master` और `quiet-retirement` अभियान अंत - लंबे समय से प्रभाव / ब्लैकमेल / वैधता पर गेट किया गया जो अंतिम परत ने कठोर रूप से शून्य के रूप में पढ़ा - अब वास्तविक लाभ भंडार के माध्यम से पहुंच योग्य हैं जिसे पूरी सामाजिक अर्थव्यवस्था लिखती है। साथी प्रस्थान भी एनपीसी-एजेंसी ब्रेकप्वाइंट और मनोबल-तल गिरावट के माध्यम से पहुंच योग्य है
- **`audit-content` देव CLI (v3.0):** एक डेवलपर सामग्री-ऑडिट कमांड (`validate` का भाई, खिलाड़ी-सामना करने वाले निदेशक के लेज़र से अलग) जो पैक पर छह मुठभेड़ / बॉस / मुकाबला निर्देशक प्रारूपकों को चलाता है
- **शैली-स्वाद वाली *शुरुआती आपूर्ति* - v3.0 का ओपनर, वितरित (v3.1):** `economyGenre` प्रत्येक स्टार्टर की नंगे नियमसेट कुंजी को `buildWorldStack` → `createEconomyCore` के माध्यम से थ्रेड करता है, इसलिए एक जिला अब अपनी शैली के `GENRE_SUPPLY_DEFAULTS` प्रोफ़ाइल (साइबरपंक घटकों / तस्करी पर उच्च है, फंतासी दवा दुर्लभ है) को सीड करता है, न कि एक सपाट सार्वभौमिक आधार रेखा - शुरुआती आपूर्ति जो निदेशक का बाजार स्वर और अंतिम इनपुट पहले से ही पढ़ते हैं। दस स्टार्टर में से सात में शैली प्रोफ़ाइल होती है; तीन बेसलाइन पर वापस आ जाते हैं, ईमानदारी से। `tradeGenre` / `craftingGenre` से अलग एक क्षेत्र ताकि तीनों बाद में भिन्न हो सकें
- **सामाजिक सतह, पूर्ण (v3.1):** `deny` और `bury-scandal` - अफवाह हेरफेर जोड़ी जो आईडी द्वारा किसी मौजूदा अफवाह को लक्षित करती है, न कि गुट द्वारा - क्रमांकित मेनू तक पहुंचती है एक अफवाह-लक्ष्य युग्मन आयाम के माध्यम से, इक्कीस-क्रिया सतह को बंद करना (19 → 21 प्रदर्शित)
- **`obligation-exists` संवाद, वायर्ड और पहुंच योग्य (v3.1):** संवाद स्थिति एक नामित एनपीसी के बने रहने वाले दायित्व लेज़र (`getPersistedNpcObligations`) को पढ़ती है - फंतासी का भाई एल्ड्रिक, एक बार जब वह सामान्य एनपीसी-एजेंसी प्ले के माध्यम से आपका पक्ष करता है, तो `call-in-favor` विकल्प अनलॉक करता है - एक वास्तविक गेट जहां v3.0 ने हमेशा सत्य स्टब छोड़ दिया (एक चरण-9 खेले गए सत्र ऑडिट ने साबित किया कि यह एक वास्तविक रन में पहुंच योग्य है, न केवल इकाई-हरा)
- **शैली-स्वाद वाली मरम्मत (v3.1):** प्रत्येक शैली-ले जाने वाला स्टार्टर अपनी शैली तालिका में एक हस्ताक्षर `repair` नुस्खा बनाता है (फंतासी `repair-rune-mend`, साइबरपंक `repair-nanite-weld`, …), `getAvailableRecipes` के माध्यम से प्रदर्शित - अब मरम्मत का स्वाद होता है, न कि केवल सार्वभौमिक
- **ऑप्ट-इन XRPL लेज़र निपटान (v3.2):** एक नया वैकल्पिक `@ai-rpg-engine/ledger-adapter` पैकेज खिलाड़ी के स्वामित्व वाली व्यापार योग्य परत को बांधता है - `coin` → एक आईओयू, उपभोग्य वस्तुएं → फंजिबल टोकन, एक चेकपॉइंट का शुद्ध `buy`/`sell` डेल्टा → एक बसे हुए **XLS-85 टोकन एस्क्रो** - को **XRPL टेस्टनेट**, पूरी तरह से नियतात्मक कोर के बाहर। `core`/`modules` में कुछ भी इसे आयात नहीं करता है और एक रन इसके साथ या उसके बिना बाइट-समान होता है (वास्तविक समुद्री डाकू `createGame()` व्यापारी लूप पर सिद्ध)। केवल परीक्षण नेटवर्क पर, मुख्य नेटवर्क में कोड में असंभव गार्ड के पीछे, एक gitignored सीक्रेट साइडकार, संरक्षण-सुरक्षित पुन: प्रयास, ऑन-चेन मेमो सत्यापन और एक अनचैंक्ड फ़ॉलबैक के साथ; लाइव टेस्टनेट पर अंत-से-अंत तक सिद्ध (टोकन एस्क्रो के माध्यम से निपटान → `reconcile` ऑन-लेज़र बैलेंस + मेमोज़)। एनएफटी अद्वितीय गियर v3.3 में उतरता है (नीचे)। [XRPL लेज़र एडाप्टर](#the-xrpl-ledger-adapter-opt-in) देखें
- **अद्वितीय गियर के रूप में NFT (v3.3):** `@ai-rpg-engine/ledger-adapter` `equipment` पैकेज के अद्वितीय गियर को बांधता है - v3.2 से स्थगित "बाद का टुकड़ा" - XRPL NFT: प्रत्येक अद्वितीय आइटम एक **XLS-20 NFToken** (`tfMutable`, कभी भी जलाया नहीं जा सकता - वास्तविक खिलाड़ी स्वामित्व) के रूप में चेकपॉइंट पर बनाया जाता है, अवशेष वृद्धि एक परिवर्तनशील NFT के मेटाडेटा को जगह में आगे बढ़ाती है **XLS-46 `NFTokenModify`**, और एक `reconcile()` स्वामित्व परिवार ऑन-लेज़र `account_nfts` को सत्यापित करता है। उपकरण लोडआउट पर एक अलग पढ़ने का पथ, फंजिबल परत के साथ ले जाया जाता है - समान नियतिवाद फ़ायरवॉल, इसके साथ या उसके बिना बाइट-समान। वास्तविक `starter-gladiator` खेले गए सत्र पर सिद्ध, लाइव टेस्टनेट पर (उपकरण `trident-and-net` को एनएफटी के रूप में बनाएं, इसे ऑन-लेज़र पर रखें, समेटें, दुनिया अपरिवर्तित)
- **एक गियर जो एक नाम अर्जित करता है (v3.4):** अवशेष वृद्धि v3.3 से मौजूद थी लेकिन खेल के दौरान कभी भी फायर नहीं हुई - किसी भी गेम में कोई आइटम क्रॉनिकल नहीं था, इसलिए प्रत्येक आइटम का अवशेष संस्करण स्थायी रूप से `0` था। लेखन पक्ष अब जहाज करता है: एक **ऑप्ट-इन `item-chronicle-core`** मॉड्यूल वास्तविक प्ले से `acquired` / `used-in-kill` / `recognized` रिकॉर्ड करता है, और `starter-gladiator` इसे तार करता है - तीन अखाड़े की लड़ाई जीतें और रेटियारियस त्रिशूल शेष रन के लिए **रक्त-रंजित त्रिशूल और जाल** है, HUD में दिखाया गया है और निदेशक का लेज़र। यह भी **एनएफटी लूप को बंद कर देता है**: एक चेकपॉइंट उस वृद्धि को वास्तविक **XLS-46 `NFTokenModify`** के रूप में स्थापित करता है, ऑन-लेज़र यूआरआई को आगे बढ़ाता है जबकि एनएफटीओकेएनआईडी को संरक्षित करता है। साथ ही फिक्स: `boss-kill` और `recognized` प्रत्येक शिप किए गए पैक पर दुर्गम थे (एक नंगे `boss` टैग जांच सामग्री के खिलाफ जो `role:boss` टैग करती है, और एक गुट गार्ड जहां कोई इकाई एक सेट नहीं करती है) - और बाद वाला चुपचाप सभी कवच वृद्धि को अवरुद्ध कर रहा था। निर्माण द्वारा ऑप्ट-इन: एक पैक जिसमें यह तारित नहीं है, वह इंजन के समान बाइट-समान है जो इससे पहले मौजूद था
- **एक गेम जिसका लूप ऋण है (v3.5):** ग्यारहवां स्टार्टर, **साल्ट रोड लेज़र**, पहला है जिसे शैली के बजाय किसी प्रणाली से पीछे की ओर बनाया गया है - आप किसी और की पूंजी पर व्यापार करने वाले कारक को निभाते हैं, और पांच वाणिज्य क्रियाएं (`appraise` / `haggle` / `consign` / `underwrite` / `audit`) गेम चलाती हैं जबकि मुकाबला एक दंड के रूप में मूल्यवान है (संसाधन प्रोफ़ाइल में एक खाली `gains` सरणी होती है - हिंसा को कुछ भी पुरस्कृत नहीं करता)। `consign` सूची में एकमात्र क्रिया है जिसकी ऑफ़लाइन सिमेंटिक्स एक-से-एक निपटान आदिम से मेल खाती है, जो इसे लेज़र एडाप्टर के लिए संदर्भ पैक बनाती है जबकि इसमें **इस पर कोई निर्भरता नहीं होती**। `mercantile` शैली और एक व्यापारी अर्थव्यवस्था प्रोफ़ाइल के साथ जहाज करता है, और पैक रूब्रिक पर 7/7। उसी चक्र ने दो लंबे समय से निष्क्रिय एडाप्टर अक्षों को वास्तविक बना दिया - मेमो `VERB:` फ़ील्ड (सदस्यों के साथ घोषित जो कोई भी कॉल साइट उत्सर्जित नहीं कर सकती), और `config.settlement` (कहीं भी शून्य रीड के साथ घोषित) - और नए पैक के खेले गए सत्र ऑडिट में छह यांत्रिकी पाए गए जो वायर्ड, स्कीमा-मान्य, इकाई-हरे थे और मृत
- `ai-rpg-engine create-starter <name>` - एक नया गेम स्केच करें (स्टैंडअलोन, मोनोरेपो के बाहर चलता है); `validate` + `scaffold` सामग्री आदेश; JSON से पैक लोड करें
- npm पर प्रकाशित स्टार्टर टेम्पलेट (`@ai-rpg-engine/starter-template`)
- पूर्ण परीक्षण सूट: **5911 परीक्षण** (दोहराए गए रनों में नियतात्मक; CI में प्रकार-जांच की गई परीक्षण फ़ाइलें; कवरेज रैचेट लागू)।

**What is rough or incomplete:**
- The AI worldbuilding studio (Ollama layer) is more lightly tested than the simulation core, and needs a local Ollama daemon; it is entirely optional — the engine and the `run` loop need no network
- The narration/audio stack builds deterministic audio commands but there is **no terminal audio backend** — nothing plays a sound; the commands are an integration hook for a GUI/web embedder
- Multiplayer (two human players sharing one world) is **not** built — it is a networking layer, deliberately out of scope; profiles today target a single controller
- `replay --replay` restores the save instead of re-simulating — and after v2.9 that is the **decided** direction, not a deferral: `Engine.serialize()` is already a proven full-state snapshot, whereas re-simulation would have to chase world-tick/encounter state that lives outside the action log. v2.9 ships multi-checkpoint save slots on that proven restore path; true event-sourced resim is not planned
- v3.1 closed v3.0's three named ceilings — genre **starting supply**, genre-specific *repair* recipes, and the `deny` / `bury-scandal` menu surface all ship now. The honest ceiling that remains: those new genre repair recipes carry an authored `statDelta` (a small stat bonus) that `resolveRepair` does not apply yet — repair *restores*, `modify` *upgrades* — so repair-as-upgrade is marked in-code and **deferred to v3.2/v3.3** as a deliberate mechanic call, not a silent inert field. And `obligation-exists` ships with one authored demo (Brother Aldric); the condition is live for content authors to gate more dialogue on
- Documentation is extensive but not every handbook page reflects the very latest APIs

---

## यह कैसा दिखता है

The bundled terminal UI composes each turn into labeled sections — scene, status, log, and actions — with a glance-able HUD. Output is plain text by default and adds semantic color on a TTY (damage red, heals green, rejections yellow), honoring `NO_COLOR` and non-TTY pipes; every cue is carried in the text too, never color alone.

```text
── The Crypt Gate ──────────────────────────────────────────
  [dark, unhallowed]

  ! Crypt Warden · HP 6/14 · Off Balance
  ! Bone Thrall · defeated
  + Mira · HP 11/16

  * rusted portcullis winch

  Exits: Ossuary, Churchyard

── Status ──────────────────────────────────────────────────
  HP 9/20 [#####-----]  Stamina 4/10
  Status: Guarded
  Items: healing-draught, grave-key

── Log ─────────────────────────────────────────────────────
  > Ash takes a guarded stance.
  > Hit!  4 damage dealt (HP: 6)
  > Bone Thrall defeated!
  > You can't do that: not enough stamina

── Actions ─────────────────────────────────────────────────
  [ 1] Move to Ossuary      [ 3] Attack Crypt Warden
  [ 2] Move to Churchyard   [ 4] Inspect Crypt Warden
────────────────────────────────────────────────────────────
```

---

## स्थापित करें और खेलें

टर्मिनल से एक शुरुआती गेम खेलें या अपना खुद का गेम बनाएं:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

The `run` loop is a real turn-based session: enemies act on their own AI
profiles, abilities and XP are on the menu, you can save and resume, and a
fight ends in victory or defeat. Every game is deterministic and replayable.

वैकल्पिक रूप से, एआई डिज़ाइन स्टूडियो अपने स्वयं के कमांड के रूप में स्थापित होता है:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

स्टूडियो एक स्थानीय [ओलामा](https://ollama.com) डेमॉन से संवाद करता है – पहले `ollama serve` और `ollama pull qwen2.5-coder` चलाएं। यह पूरी तरह से वैकल्पिक है; इंजन और `run` लूप को किसी नेटवर्क की आवश्यकता नहीं होती।

एक कंटेनर इमेज को जीएचसीआर पर `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` के रूप में प्रकाशित किया जाता है, जिसका उपयोग सीआई और सैंडबॉक्स्ड रन के लिए किया जाता है।

---

## त्वरित शुरुआत

क्या आप कोड में अपना गेम बनाना पसंद करते हैं? मॉड्यूल से इंजन बनाएं:

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

पूर्ण वर्कफ़्लो के लिए [कंपोज़िशन गाइड](docs/handbook/57-composition-guide.md) देखें, या एक नया शुरुआती बनाएं:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## आर्किटेक्चर

| परत | भूमिका |
|-------|------|
| **Core Runtime** | नियतात्मक इंजन - विश्व स्थिति, घटनाएं, क्रियाएं, टिक, आरएनजी, पुनरावृत्ति। |
| **Modules** | 30+ कंपोजेबल सिस्टम - युद्ध, धारणा, अनुभूति, गुट, यात्रा, साथी, आदि। |
| **Content** | इकाइयाँ, क्षेत्र, संवाद, आइटम, क्षमताएँ, स्थितियाँ - लेखक द्वारा बनाई गई। |
| **AI Studio** | वैकल्पिक ओलामा परत - ढांचा, आलोचना, संतुलन विश्लेषण, ट्यूनिंग, प्रयोग। |

---

## XRPL लेजर एडॉप्टर (ऑप्ट-इन)।

`@ai-rpg-engine/ledger-adapter` एक **वैकल्पिक** पैकेज है जो किसी गेम की **खिलाड़ी-स्वामित्व वाली व्यापार योग्य परत** – `coin` बैलेंस और उपभोग करने योग्य इन्वेंट्री को जोड़ता है, जिसे `trade-core` के `buy`/`sell` क्रियाएँ पहले से ही स्थानांतरित करती हैं – को **एक्सआरपीएल टेस्टनेट** से जोड़ता है, ताकि उन संपत्तियों का समर्थन वास्तविक ऑन-लेजर टोकन द्वारा किया जा सके और उन्हें चेकपॉइंट पर निपटाया जा सके। अनुपस्थित एडाप्टर ठीक वही ऑफ़लाइन इंजन है जो आज उपलब्ध है।

**नियतिवाद अपरिवर्तनीय (पूरा बिंदु)।** एडॉप्टर एक *साइड चैनल* है, सिमुलेशन का कभी हिस्सा नहीं:

- इसे **कभी भी नियतात्मक टिक के अंदर नहीं बुलाया जाता** – केवल **चेकपॉइंट** पर (सेव, शहर/बाजार में प्रवेश, अध्याय का अंत)।
- `@ai-rpg-engine/core` या `@ai-rpg-engine/modules` में कुछ भी इसे आयात नहीं करता है (इसकी एकमात्र इंजन निर्भरता संकलन-समय `import type` है)।
- **किसी रन में यह शामिल हो या न हो, दोनों ही स्थितियों में वह समान रहता है।** एक फ़ायरवॉल परीक्षण वास्तविक `starter-pirate` `createGame()` व्यापारी लूप को दो इंजनों पर चलाता है – एक जिसमें एडाप्टर सक्षम है और चेकपॉइंट पर निपटान होता है – और पुष्टि करता है कि दोनों दुनिया गहरे रूप से समान हैं। सीड-0 रीप्ले अपरिवर्तित रहता है।

**एकीकरण स्तर - एक गेम इसे जितना गहरा चाहता है, उतना ही एकीकृत करता है।** फ़ायरवॉल एक *नियतिवाद* सीमा है, न कि एक एंटी-एकीकरण नियम; उपरोक्त हर स्तर पर लागू होता है:

| स्तर | एडॉप्टर पर क्या निर्भर करता है | फिट बैठता है |
|-------|-----------------------------|------|
| **L0 — External observer** | गेम के अंदर कुछ भी नहीं; एडॉप्टर चेकपॉइंट पर बाहर से जुड़ता है और गेम अनजान रहता है। | एक मौजूदा गेम को फिर से तैयार करना (शिप किए गए पायरेट डेमो)। |
| **L1 - गेम-संचालित चेकपॉइंट** | गेम का अपना सहेजें / शहर / मेटा-प्रगति प्रवाह परिभाषित क्षणों पर एडॉप्टर को कॉल करता है। | एक ऐसा गेम जो जानबूझकर लेजर क्षण चाहता है। |
| **L2 — Ledger-native design** | गेम की अर्थव्यवस्था या पहचान को *ऑन-चेन स्वामित्व* (स्थायी जारीकर्ता, वास्तविक बाजार) के आसपास डिज़ाइन किया गया है। | एक लेजर-प्रथम व्यापारी गेम। |

वह अंतर जो रिप्ले को सुरक्षित रखता है वह **यह नहीं** है कि "कौन सा पैकेज एडॉप्टर आयात करता है" बल्कि "क्या कॉल टिक के अंदर है।" एक गेम पैकेज स्वतंत्र रूप से एडॉप्टर को आयात और चला सकता है, जब तक कि प्रत्येक कॉल बीज-संचालित रिप्ले लूप के बाहर चेकपॉइंट पर हो।

**Three play modes.** `offline` (default — no chain, the engine as it ships) ·
`ledger` (coin/items backed by testnet balances, settled at checkpoints) ·
`diary` (play offline, then anchor the run's state hash on-ledger for a
tamper-evident receipt).

**लेजर में क्या है।** `coin` → एक ट्रस्ट लाइन पर जारी मुद्रा आईओयू; उपभोग करने योग्य वस्तुएँ → परिवर्तनीय टोकन; किसी चेकपॉइंट का शुद्ध व्यापार अंतर → **एक्सएलएस-85 टोकन एस्क्रो** के माध्यम से निपटाया गया स्थानांतरण। अद्वितीय उपकरण **एक्सएलएस-20 एनएफटी** (v3.3) के रूप में आते हैं, जिसमें अवशेष वृद्धि वास्तविक प्ले द्वारा v3.4 से एक परिवर्तनीय एनएफटी की मेटाडेटा को अपडेट करती है – यह **एक्सएलएस-46 `NFTokenModify`** द्वारा संचालित होता है। अमूर्त जिला अर्थव्यवस्था (`economy-core`) अपरिवर्तित रहती है – यह एक शुद्ध सिमुलेशन बनी रहती है।

**सुरक्षा रेल।** केवल टेस्टनेट, एक **मेननेट-असंभव-इन-कोड** संरचनात्मक गार्ड के साथ (कोई कॉन्फ़िगरेशन ध्वज नहीं); वॉलेट बीज एक gitignored सीक्रेट साइडकार में रहते हैं, कभी भी सहेजें फ़ाइल में नहीं; निपटान पुन: प्रयास पथ पर निष्क्रिय और संरक्षण-सुरक्षित है; प्रमाण **वास्तविक ऑन-चेन मेमो** को सत्यापित करते हैं (इंजन का अपना स्ट्रिंग नहीं); और यदि श्रृंखला दुर्गम है तो रन बस जारी रहता है, *अनएन्कर्ड* के रूप में चिह्नित।

**Proven live.** A real `starter-pirate` merchant run — sell a cutlass, buy a
cannon-shell — settles on XRPL testnet via token escrow, then `reconcile()`
confirms on-ledger balances and memos against the engine's economy (conservation
holds for every token). The ledger is a different system family than the engine,
so the engine cannot fake it — reconciliation is a genuine external verifier.
Testnet only; assets are game-scoped receipts, not securities.

---

## युद्ध प्रणाली

पांच क्रियाएं (हमला, रक्षा, अलग होना, सहारा देना, पुन: स्थिति), चार युद्ध अवस्थाएं (संरक्षित, असंतुलित, उजागर, भागना), चार संलग्नता अवस्थाएं (संलग्न, संरक्षित, बैकलाइन, पृथक)। तीन आँकड़े आयाम हर सूत्र को चलाते हैं इसलिए एक त्वरित द्वंद्ववादी एक भारी ब्रूज़र या एक रचनाबद्ध प्रहरी से अलग तरीके से खेलता है।

एआई विरोधी एकीकृत निर्णय स्कोरिंग का उपयोग करते हैं - युद्ध क्रियाएं और क्षमताएं एक ही मूल्यांकन में प्रतिस्पर्धा करती हैं, जिसमें मामूली क्षमता स्पैम को रोकने के लिए कॉन्फ़िगर करने योग्य सीमाएँ होती हैं।

पैक लेखक, युद्ध को एक सांख्यिकीय मानचित्रण, संसाधन प्रोफ़ाइल और पूर्वाग्रह टैग से जोड़ने के लिए `buildCombatStack()` का उपयोग करते हैं। [कॉम्बैट ओवरव्यू](site/src/content/docs/handbook/49a-combat-overview.md) और [पैक ऑथर गाइड](site/src/content/docs/handbook/55-combat-pack-guide.md) देखें।

---

## क्षमताएं

शैली-देशी क्षमता प्रणाली जिसमें लागत, आँकड़े की जांच, कूलडाउन और टाइप किए गए प्रभाव (नुकसान, उपचार, स्थिति लागू करें, शुद्ध करें) शामिल हैं। स्थिति प्रभावों में प्रतिरोध / भेद्यता प्रोफाइल के साथ 11-टैग सिमेंटिक शब्दावली का उपयोग किया जाता है। एआई-जागरूक चयन स्व / AoE / एकल-लक्ष्य पथों को स्कोर करता है।

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

---

## पैकेज

| पैकेज | उद्देश्य |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | नियतात्मक सिमुलेशन रनटाइम - विश्व स्थिति, घटनाएं, आरएनजी, टिक, क्रिया समाधान। |
| [`@ai-rpg-engine/modules`](packages/modules) | 30+ कंपोजेबल मॉड्यूल - युद्ध, धारणा, अनुभूति, गुट, अफवाहें, यात्रा, साथी, एनपीसी एजेंसी, रणनीतिक मानचित्र, आइटम पहचान, उभरते अवसर, चाप का पता लगाना, अंतिम खेल ट्रिगर। |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | विश्व सामग्री के लिए विहित स्कीमा और सत्यापनकर्ता। |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | चरित्र का विकास, चोटें, महत्वपूर्ण पड़ाव, प्रतिष्ठा। |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | आदर्श प्रकार का चयन, संरचना निर्माण, शुरुआती उपकरण। |
| [`@ai-rpg-engine/equipment`](packages/equipment) | उपकरण प्रकार, आइटम उत्पत्ति और अवशेष वृद्धि – जिसमें `item-chronicle-core` शामिल है, जो एक वैकल्पिक मॉड्यूल है जो वास्तविक प्ले से गियर इतिहास रिकॉर्ड करता है ताकि आइटम उपनाम और स्तर अर्जित करें। |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | विभिन्न सत्रों में स्मृति, संबंधपरक प्रभाव, अभियान की स्थिति। |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | अफवाह का जीवनचक्र, परिवर्तन की प्रक्रिया, प्रसार का पता लगाना। |
| [`@ai-rpg-engine/presentation`](packages/presentation) | कथा-वर्णन योजना का ढांचा, अनुबंधों का प्रारूपण, आवाज प्रोफाइल। |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | संकेत निर्धारण, प्राथमिकता, ध्वनि कम करना, शीतन अवधि तर्क। |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | ध्वनि पैकेज की सूची, सामग्री-आधारित रजिस्ट्री। |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | पैक पंजीकरण, मूल्यांकन मानदंड, पैक की खोज। |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | चित्रों, आइकनों और मीडिया के लिए सामग्री-आधारित संग्रहण। |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | प्लग-इन योग्य प्रदाताओं के साथ सिर रहित पोर्ट्रेट का निर्माण। |
| [`@ai-rpg-engine/ollama`](packages/ollama) | वैकल्पिक एआई-आधारित लेखन सुविधा – ढांचा तैयार करना, आलोचनात्मक मूल्यांकन, निर्देशित कार्यप्रवाह, अनुकूलन और प्रयोग। |
| [`@ai-rpg-engine/cli`](packages/cli) | सीएलआई: गेम चलाएं, शुरुआती टेम्पलेट बनाएं, सहेजे गए डेटा की जांच करें। |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | टर्मिनल रेंडरर और इनपुट लेयर। |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | व्यापारिक स्टार्टर – लेजर एडाप्टर के लिए संदर्भ पैक, जिस पर इसकी कोई निर्भरता नहीं है। |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **वैकल्पिक** - खिलाड़ी द्वारा स्वामित्व वाली व्यापार योग्य परत (सिक्का / इन्वेंट्री / व्यापार) के लिए ऑप्ट-इन XRPL टेस्टनेट निपटान, चेकपॉइंट पर XLS-85 टोकन एस्क्रो के माध्यम से, पूरी तरह से नियतात्मक कोर के बाहर। |

### शुरुआती उदाहरण

ये दस शुरुआती दुनियाएँ **रचना के उदाहरण** हैं – ये दर्शाती हैं कि गेम इंजन मॉड्यूल को मिलाकर पूर्ण गेम कैसे बनाया जा सकता है। प्रत्येक दुनिया विभिन्न प्रकार के पैटर्न (सांख्यिकीय मानचित्रण, संसाधन प्रोफाइल, जुड़ाव कॉन्फ़िगरेशन, क्षमता सेट) दिखाती है। प्रत्येक शुरुआती दुनिया के ‘रीडमी’ में “दिखाए गए पैटर्न” और “क्या उपयोग किया जा सकता है” देखें।

| शुरुआती/प्रारंभिक | शैली | प्रमुख पैटर्न |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | अंधकारमय काल्पनिक कथा | न्यूनतम युद्ध, संवाद पर आधारित। |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | साइबरपंक | संसाधन, भागीदारी की भूमिकाएँ। |
| [`starter-detective`](packages/starter-detective) | विक्टोरियन रहस्य | सामाजिक दृष्टिकोण को प्राथमिकता, धारणा पर अधिक जोर। |
| [`starter-pirate`](packages/starter-pirate) | समुद्री डाकू | नौसैनिक + हाथापाई युद्ध, बहु-क्षेत्रीय |
| [`starter-zombie`](packages/starter-zombie) | ज़ॉम्बी से बचने की रणनीति/तरीका। | कमी, संक्रमण, संसाधन। |
| [`starter-weird-west`](packages/starter-weird-west) | अजीब पश्चिम | पूर्वाग्रहों को दूर करें, सुरक्षित वातावरण में सुधार करें। |
| [`starter-colony`](packages/starter-colony) | विज्ञान कथा पर आधारित कॉलोनी। | संकरी राहें, घात लगाने के स्थान। |
| [`starter-ronin`](packages/starter-ronin) | सामंती जापान | छिपे हुए मार्ग, कई सुरक्षात्मक भूमिकाएँ। |
| [`starter-merchant`](packages/starter-merchant) | व्यापारिक | लूप के रूप में दायित्व, दंड के रूप में मूल्यवान युद्ध |
| [`starter-vampire`](packages/starter-vampire) | पिशाच हॉरर। | रक्त संसाधन, सामाजिक हेरफेर। |
| [`starter-gladiator`](packages/starter-gladiator) | ऐतिहासिक ग्लैडिएटर | अखाड़े में मुकाबला, दर्शकों का समर्थन। |

---

## दस्तावेज़ीकरण

| संसाधन | विवरण |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | एक नया गेम बनाएं – कमांड लाइन इंटरफेस (सीएलआई) या मैन्युअल टेम्पलेट विधि का उपयोग करें। |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | इंजन मॉड्यूल को जोड़कर अपना खुद का गेम बनाएं। |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | प्रति-इकाई नियम समाधान – मिश्रित-शैली का युद्ध, `applyProfile`, प्रोफ़ाइल टेम्पलेट, `profile` सीएलआई। |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | ऑप्ट-इन ऑन-लेजर निपटान - नियतिवाद फ़ायरवॉल, L0/L1/L2 एकीकरण स्तर, प्ले मोड, सुरक्षा रेल और लाइव-सिद्ध पायरेट डेमो। |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | छह प्रमुख युद्ध रणनीतियाँ, पाँच क्रियाएँ, और राज्यों की त्वरित जानकारी। |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | क्रमबद्ध तरीके से कॉम्बैट स्टैक बनाएं, आँकड़ों का मानचित्रण करें और संसाधनों की जानकारी तैयार करें। |
| [Handbook](site/src/content/docs/handbook/index.md) | विस्तृत निर्देशिका – सभी प्रणालियों का विवरण, साथ ही चार परिशिष्ट। |
| [Composition Model](docs/composition-model.md) | छह पुन: प्रयोज्य परतें और वे कैसे मिलकर एक संरचना बनाती हैं। |
| [Examples](docs/examples/) | चलाने योग्य टाइपस्क्रिप्ट उदाहरण (टाइप-जांच और सीआई में व्यवहार परीक्षण के साथ)—प्रत्येक इकाई के लिए मिश्रित पार्टी, साझा प्रोफाइल, विभिन्न दुनियाओं में उपयोग, शुरुआत से। |
| [Design Document](docs/DESIGN.md) | आर्किटेक्चर का गहन अध्ययन – क्रियान्वयन प्रक्रिया, वास्तविकता बनाम प्रस्तुति। |
| [Philosophy](PHILOSOPHY.md) | निश्चित नियमों पर आधारित दुनिया, प्रमाणों द्वारा संचालित डिज़ाइन, कृत्रिम बुद्धिमत्ता सहायक के रूप में। |
| [Changelog](CHANGELOG.md) | रिलीज़ इतिहास |

---

## कार्य योजना

### हम अभी कहाँ हैं।

Both composition spines are complete — 5911 tests across 307 files, all 11 starters on `buildCombatStack` **and** `buildWorldStack`, deterministic byte-identical replay under printed seeds, full AI decision scoring, and a CLI that scaffolds, runs, validates, and inspects. **v3.0 makes the world live: named NPCs come alive with goals, trust/fear/greed/loyalty relationships, obligation ledgers, and consequence chains; the social layer earns passively and spends across twenty-one new diplomacy/sabotage verbs; the economy is genre-flavored per starter; and the leverage you earn finally reaches the campaign endings it gates. A Phase-9 audit caught the headline wired-but-inert in shipped content — the fix ships a named NPC in every starter.**

**Recent release arc (v2.4.0–v3.0.0):**
- v2.4.0 — Party combat (ally-targeting / heal / buff / revive, friend-foe AoE), status-effect system (modifiers + DoT/HoT + reactive triggers), plug-in Profiles Phase 1, content `validate`/`scaffold` CLI
- v2.5.0 — Per-entity rule resolution (mixed-playstyle combat), the `applyProfile` loader + per-entity abilities, profile templates + `profile` CLI, and a full health pass
- v2.6.0 — The `run` command became a real game: enemies act on their own AI profiles, victory/defeat, save/resume, abilities and XP on the menu, the `ai` studio bin, and the narration stack
- v2.7.0 — The world reacts and there's a reason to return: heat → pressures → narrated consequences, zone-entry encounters, a quest loop + Journal, equipment in combat, seeded replayable runs, live endgame inputs, `buildWorldStack`, the Director's Ledger, and a save-migration seam
- v2.8.0 — Act on the world you live in: a live trade economy + `sell` verb, companions you recruit and fight beside, and a Director's Ledger reading the whole board — one write-wire per system lit ~12 consumers that shipped dark
- v2.9.0 — Close the loops: `buy` + merchant stock and crafting complete the economy; companions take independent turns; four social verbs (bribe / intimidate / petition / seed) run on a leverage economy funded by opportunity rewards; opportunities resolve with expiry + favor-fallout consequence; and equipment, quests, recruitables, and starting coin roll out uniformly to all ten starters
- **v3.0.0 — Make the world live: the npc-agency producer lights named NPCs (goals / relationships / obligation ledgers / consequence chains) plus a story NPC in every starter; the social surface grows to 25 verbs (diplomacy + sabotage) with passive leverage income and dialogue that reads social state; per-starter genre-flavored stock + recipes; the leverage endings (victory / puppet-master / quiet-retirement) become reachable; repair/modify menu rows, escort opportunities, and an `audit-content` dev CLI — shipped through a Phase-9 audit that caught two dead-wires the green test suite hid**

### अगला (v2.8 ढांचा)

- **Living NPCs** — the persisted npc-agency producer that lights the Director's PEOPLE section: named NPCs with goals, relationship breakpoints, obligation ledgers, and consequence chains, plus companion-morale favor-fallout and the departure-risk path the reaction system already carries
- Genre-flavored merchant stock and crafting recipes (per-starter genre threading over the universal fallback that ships today), and the `repair`/`modify` menu surface
- The leverage economy's next layer — passive income beyond opportunity rewards, and social verbs beyond the shipped four (diplomacy / sabotage groups) — plus the dialogue condition/effect vocabulary that reads the new social state
- Multiplayer — two *human* players sharing one world (a networking layer, deliberately deferred; single-controller shared profiles ship today as [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Serializable formula overrides — per-profile formula tuning (blocked on a formula DSL; profiles carry stat mappings today, not closures)
- API documentation sync — ensure every handbook page reflects the latest APIs

### गंतव्य: प्लग-इन प्रोफाइल।

The engine's end goal is **user-defined profiles** — portable bundles that slot into any game. A profile packages a stat mapping, resource behavior, AI bias tags, and abilities into a single importable unit. As of v2.5, entities in one world can each carry their own profile and resolve combat per-entity — a `might` fighter and a `will` mystic share a party, each bringing their own playstyle.

The schema, the `applyProfile` loader, per-entity ability resolution, and cross-profile validation are all shipped. What remains is multiplayer — letting two *human* players (not just two entities) share a world — which is a networking layer. See [Profile Roadmap](docs/profile-roadmap.md) and [feature-architecture.md](docs/feature-architecture.md) for the design.

---

## दर्शनशास्त्र

एआई आरपीजी इंजन तीन मुख्य विचारों पर आधारित है:

1. **निश्चित दुनिया** — सिमुलेशन के परिणाम दोहराए जा सकने चाहिए।
2. **साक्ष्य-आधारित डिज़ाइन** — दुनिया की यांत्रिकी का परीक्षण सिमुलेशन के माध्यम से किया जाना चाहिए।
3. **सहायक के रूप में एआई, अधिकार नहीं** — एआई उपकरण डिज़ाइनों को उत्पन्न करने और उनकी आलोचना करने में मदद करते हैं, लेकिन वे निश्चित प्रणालियों को प्रतिस्थापित नहीं करते हैं।

पूर्ण विवरण के लिए [PHILOSOPHY.md](PHILOSOPHY.md) देखें।

---

## सुरक्षा

The core engine is a **local-only simulation library**: no telemetry, no network, no secrets. Save files go to `.ai-rpg-engine/` only when explicitly requested. Two **optional** layers add an outbound path, and only when you invoke them:

- The AI layer (`@ai-rpg-engine/ollama`) talks to a **local** Ollama daemon; its opt-in `webfetch` (for RAG) is confined by an SSRF guard (blocks loopback/link-local/CGNAT/cloud-metadata and IPv6-tunnelled equivalents).
- The ledger layer (`@ai-rpg-engine/ledger-adapter`) reaches the **XRPL testnet** — and only the testnet: a **mainnet-impossible-in-code** structural guard (not a config flag) rejects any non-testnet host at construction. Wallet seeds live in a gitignored secrets sidecar, never in a save file, and the deterministic core never imports the adapter.

अधिक जानकारी के लिए [SECURITY.md](SECURITY.md) देखें।

## आवश्यकताएँ

- Node.js >= 20
- TypeScript (ईएसएम मॉड्यूल)

## लाइसेंस

[MIT](LICENSE)

---

<a href="https://mcp-tool-shop.github.io/">एमसीपी टूल शॉप</a> द्वारा निर्मित
