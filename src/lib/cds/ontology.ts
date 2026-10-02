// Built-in pharmacological knowledge base (ATC level 4 + ingredient synonyms).
// Resolution is by whole-word ingredient/brand match, never raw substring,
// so brand names and combination products map to their molecular classes.

export interface IngredientConcept {
  ingredient: string;
  atc: string; // ATC level 5 code
  atc4: string; // ATC level 4 (chemical subgroup)
  className: string;
  category: string;
  synonyms?: string[]; // brands / alternate spellings
}

export const INGREDIENTS: IngredientConcept[] = [
  // Cardiovascular
  { ingredient: "enalapril", atc: "C09AA02", atc4: "C09AA", className: "ACE inhibitors", category: "Cardiovascular", synonyms: ["renitec", "vasotec"] },
  { ingredient: "lisinopril", atc: "C09AA03", atc4: "C09AA", className: "ACE inhibitors", category: "Cardiovascular", synonyms: ["zestril", "prinivil"] },
  { ingredient: "captopril", atc: "C09AA01", atc4: "C09AA", className: "ACE inhibitors", category: "Cardiovascular" },
  { ingredient: "ramipril", atc: "C09AA05", atc4: "C09AA", className: "ACE inhibitors", category: "Cardiovascular", synonyms: ["tritace"] },
  { ingredient: "perindopril", atc: "C09AA04", atc4: "C09AA", className: "ACE inhibitors", category: "Cardiovascular", synonyms: ["coversyl"] },
  { ingredient: "losartan", atc: "C09CA01", atc4: "C09CA", className: "Angiotensin II receptor blockers", category: "Cardiovascular", synonyms: ["cozaar"] },
  { ingredient: "valsartan", atc: "C09CA03", atc4: "C09CA", className: "Angiotensin II receptor blockers", category: "Cardiovascular", synonyms: ["diovan"] },
  { ingredient: "telmisartan", atc: "C09CA07", atc4: "C09CA", className: "Angiotensin II receptor blockers", category: "Cardiovascular", synonyms: ["micardis"] },
  { ingredient: "irbesartan", atc: "C09CA04", atc4: "C09CA", className: "Angiotensin II receptor blockers", category: "Cardiovascular" },
  { ingredient: "candesartan", atc: "C09CA06", atc4: "C09CA", className: "Angiotensin II receptor blockers", category: "Cardiovascular" },
  { ingredient: "spironolactone", atc: "C03DA01", atc4: "C03DA", className: "Potassium-sparing diuretics", category: "Cardiovascular", synonyms: ["aldactone"] },
  { ingredient: "amiloride", atc: "C03DB01", atc4: "C03DB", className: "Potassium-sparing diuretics", category: "Cardiovascular" },
  { ingredient: "furosemide", atc: "C03CA01", atc4: "C03CA", className: "Loop diuretics", category: "Cardiovascular", synonyms: ["lasix", "frusemide"] },
  { ingredient: "hydrochlorothiazide", atc: "C03AA03", atc4: "C03AA", className: "Thiazides", category: "Cardiovascular", synonyms: ["hctz"] },
  { ingredient: "amlodipine", atc: "C08CA01", atc4: "C08CA", className: "Dihydropyridine CCBs", category: "Cardiovascular", synonyms: ["norvasc", "amlong"] },
  { ingredient: "nifedipine", atc: "C08CA05", atc4: "C08CA", className: "Dihydropyridine CCBs", category: "Cardiovascular" },
  { ingredient: "atenolol", atc: "C07AB03", atc4: "C07AB", className: "Beta blockers", category: "Cardiovascular", synonyms: ["tenormin"] },
  { ingredient: "metoprolol", atc: "C07AB02", atc4: "C07AB", className: "Beta blockers", category: "Cardiovascular" },
  { ingredient: "bisoprolol", atc: "C07AB07", atc4: "C07AB", className: "Beta blockers", category: "Cardiovascular", synonyms: ["concor"] },
  { ingredient: "propranolol", atc: "C07AA05", atc4: "C07AA", className: "Beta blockers", category: "Cardiovascular" },
  { ingredient: "carvedilol", atc: "C07AG02", atc4: "C07AG", className: "Beta blockers", category: "Cardiovascular" },
  { ingredient: "digoxin", atc: "C01AA05", atc4: "C01AA", className: "Digitalis glycosides", category: "Cardiovascular", synonyms: ["lanoxin"] },
  { ingredient: "atorvastatin", atc: "C10AA05", atc4: "C10AA", className: "Statins", category: "Cardiovascular", synonyms: ["lipitor"] },
  { ingredient: "simvastatin", atc: "C10AA01", atc4: "C10AA", className: "Statins", category: "Cardiovascular", synonyms: ["zocor"] },
  { ingredient: "rosuvastatin", atc: "C10AA07", atc4: "C10AA", className: "Statins", category: "Cardiovascular", synonyms: ["crestor"] },
  // Blood
  { ingredient: "warfarin", atc: "B01AA03", atc4: "B01AA", className: "Vitamin K antagonists", category: "Anticoagulant", synonyms: ["coumadin", "marevan"] },
  { ingredient: "rivaroxaban", atc: "B01AF01", atc4: "B01AF", className: "Direct factor Xa inhibitors", category: "Anticoagulant", synonyms: ["xarelto"] },
  { ingredient: "apixaban", atc: "B01AF02", atc4: "B01AF", className: "Direct factor Xa inhibitors", category: "Anticoagulant", synonyms: ["eliquis"] },
  { ingredient: "enoxaparin", atc: "B01AB05", atc4: "B01AB", className: "Heparins", category: "Anticoagulant", synonyms: ["clexane"] },
  { ingredient: "heparin", atc: "B01AB01", atc4: "B01AB", className: "Heparins", category: "Anticoagulant" },
  { ingredient: "clopidogrel", atc: "B01AC04", atc4: "B01AC", className: "Platelet aggregation inhibitors", category: "Antiplatelet", synonyms: ["plavix"] },
  // Analgesics / NSAIDs
  { ingredient: "aspirin", atc: "N02BA01", atc4: "N02BA", className: "Salicylates", category: "Analgesic", synonyms: ["acetylsalicylic", "asa", "disprin", "ecotrin"] },
  { ingredient: "ibuprofen", atc: "M01AE01", atc4: "M01AE", className: "NSAIDs (propionic acid)", category: "NSAID", synonyms: ["brufen", "advil", "nurofen"] },
  { ingredient: "naproxen", atc: "M01AE02", atc4: "M01AE", className: "NSAIDs (propionic acid)", category: "NSAID" },
  { ingredient: "diclofenac", atc: "M01AB05", atc4: "M01AB", className: "NSAIDs (acetic acid)", category: "NSAID", synonyms: ["voltaren", "cataflam", "olfen"] },
  { ingredient: "indomethacin", atc: "M01AB01", atc4: "M01AB", className: "NSAIDs (acetic acid)", category: "NSAID", synonyms: ["indometacin"] },
  { ingredient: "meloxicam", atc: "M01AC06", atc4: "M01AC", className: "NSAIDs (oxicams)", category: "NSAID", synonyms: ["mobic"] },
  { ingredient: "piroxicam", atc: "M01AC01", atc4: "M01AC", className: "NSAIDs (oxicams)", category: "NSAID" },
  { ingredient: "celecoxib", atc: "M01AH01", atc4: "M01AH", className: "COX-2 inhibitors", category: "NSAID", synonyms: ["celebrex"] },
  { ingredient: "etoricoxib", atc: "M01AH05", atc4: "M01AH", className: "COX-2 inhibitors", category: "NSAID", synonyms: ["arcoxia"] },
  { ingredient: "paracetamol", atc: "N02BE01", atc4: "N02BE", className: "Anilides", category: "Analgesic", synonyms: ["acetaminophen", "panadol", "calpol", "tylenol"] },
  { ingredient: "codeine", atc: "R05DA04", atc4: "N02AJ", className: "Opioids", category: "Opioid" },
  { ingredient: "tramadol", atc: "N02AX02", atc4: "N02AX", className: "Opioids", category: "Opioid", synonyms: ["tramal"] },
  { ingredient: "morphine", atc: "N02AA01", atc4: "N02AA", className: "Opioids", category: "Opioid" },
  { ingredient: "pethidine", atc: "N02AB02", atc4: "N02AB", className: "Opioids", category: "Opioid", synonyms: ["meperidine"] },
  // CNS
  { ingredient: "fluoxetine", atc: "N06AB03", atc4: "N06AB", className: "SSRIs", category: "Antidepressant", synonyms: ["prozac"] },
  { ingredient: "sertraline", atc: "N06AB06", atc4: "N06AB", className: "SSRIs", category: "Antidepressant", synonyms: ["zoloft"] },
  { ingredient: "citalopram", atc: "N06AB04", atc4: "N06AB", className: "SSRIs", category: "Antidepressant" },
  { ingredient: "escitalopram", atc: "N06AB10", atc4: "N06AB", className: "SSRIs", category: "Antidepressant", synonyms: ["cipralex", "lexapro"] },
  { ingredient: "paroxetine", atc: "N06AB05", atc4: "N06AB", className: "SSRIs", category: "Antidepressant" },
  { ingredient: "phenelzine", atc: "N06AF03", atc4: "N06AF", className: "MAO inhibitors", category: "Antidepressant" },
  { ingredient: "tranylcypromine", atc: "N06AF04", atc4: "N06AF", className: "MAO inhibitors", category: "Antidepressant" },
  { ingredient: "selegiline", atc: "N04BD01", atc4: "N04BD", className: "MAO inhibitors", category: "Antiparkinson" },
  { ingredient: "linezolid", atc: "J01XX08", atc4: "J01XX", className: "MAO inhibitors", category: "Antibacterial" },
  { ingredient: "amitriptyline", atc: "N06AA09", atc4: "N06AA", className: "Tricyclic antidepressants", category: "Antidepressant" },
  { ingredient: "diazepam", atc: "N05BA01", atc4: "N05BA", className: "Benzodiazepines", category: "Anxiolytic", synonyms: ["valium"] },
  { ingredient: "lorazepam", atc: "N05BA06", atc4: "N05BA", className: "Benzodiazepines", category: "Anxiolytic", synonyms: ["ativan"] },
  { ingredient: "alprazolam", atc: "N05BA12", atc4: "N05BA", className: "Benzodiazepines", category: "Anxiolytic", synonyms: ["xanax"] },
  { ingredient: "midazolam", atc: "N05CD08", atc4: "N05CD", className: "Benzodiazepines", category: "Hypnotic" },
  { ingredient: "carbamazepine", atc: "N03AF01", atc4: "N03AF", className: "Carboxamide anticonvulsants", category: "Anticonvulsant", synonyms: ["tegretol"] },
  { ingredient: "phenytoin", atc: "N03AB02", atc4: "N03AB", className: "Hydantoins", category: "Anticonvulsant", synonyms: ["epanutin"] },
  // Anti-infectives
  { ingredient: "amoxicillin", atc: "J01CA04", atc4: "J01CA", className: "Penicillins", category: "Antibacterial", synonyms: ["amoxil", "amoxycillin"] },
  { ingredient: "ampicillin", atc: "J01CA01", atc4: "J01CA", className: "Penicillins", category: "Antibacterial" },
  { ingredient: "flucloxacillin", atc: "J01CF05", atc4: "J01CF", className: "Penicillins", category: "Antibacterial", synonyms: ["floxapen"] },
  { ingredient: "cloxacillin", atc: "J01CF02", atc4: "J01CF", className: "Penicillins", category: "Antibacterial" },
  { ingredient: "benzylpenicillin", atc: "J01CE01", atc4: "J01CE", className: "Penicillins", category: "Antibacterial", synonyms: ["penicillin g", "crystalline penicillin", "benzathine"] },
  { ingredient: "phenoxymethylpenicillin", atc: "J01CE02", atc4: "J01CE", className: "Penicillins", category: "Antibacterial", synonyms: ["penicillin v", "pen v"] },
  { ingredient: "clavulanic acid", atc: "J01CR02", atc4: "J01CR", className: "Penicillins", category: "Antibacterial", synonyms: ["co amoxiclav", "augmentin", "clavulanate"] },
  { ingredient: "piperacillin", atc: "J01CR05", atc4: "J01CR", className: "Penicillins", category: "Antibacterial", synonyms: ["tazocin"] },
  { ingredient: "cefalexin", atc: "J01DB01", atc4: "J01DB", className: "Cephalosporins 1st Gen", category: "Antibacterial", synonyms: ["cephalexin", "keflex"] },
  { ingredient: "cefazolin", atc: "J01DB04", atc4: "J01DB", className: "Cephalosporins 1st Gen", category: "Antibacterial" },
  { ingredient: "cefuroxime", atc: "J01DC02", atc4: "J01DC", className: "Cephalosporins 2nd Gen", category: "Antibacterial", synonyms: ["zinnat"] },
  { ingredient: "ceftriaxone", atc: "J01DD04", atc4: "J01DD", className: "Cephalosporins 3rd Gen", category: "Antibacterial", synonyms: ["rocephin"] },
  { ingredient: "cefixime", atc: "J01DD08", atc4: "J01DD", className: "Cephalosporins 3rd Gen", category: "Antibacterial" },
  { ingredient: "ceftazidime", atc: "J01DD02", atc4: "J01DD", className: "Cephalosporins 3rd Gen", category: "Antibacterial" },
  { ingredient: "meropenem", atc: "J01DH02", atc4: "J01DH", className: "Carbapenems", category: "Antibacterial" },
  { ingredient: "erythromycin", atc: "J01FA01", atc4: "J01FA", className: "Macrolides", category: "Antibacterial" },
  { ingredient: "clarithromycin", atc: "J01FA09", atc4: "J01FA", className: "Macrolides", category: "Antibacterial", synonyms: ["klacid"] },
  { ingredient: "azithromycin", atc: "J01FA10", atc4: "J01FA", className: "Macrolides", category: "Antibacterial", synonyms: ["zithromax"] },
  { ingredient: "ciprofloxacin", atc: "J01MA02", atc4: "J01MA", className: "Fluoroquinolones", category: "Antibacterial", synonyms: ["ciproxin", "cipro"] },
  { ingredient: "levofloxacin", atc: "J01MA12", atc4: "J01MA", className: "Fluoroquinolones", category: "Antibacterial" },
  { ingredient: "doxycycline", atc: "J01AA02", atc4: "J01AA", className: "Tetracyclines", category: "Antibacterial" },
  { ingredient: "sulfamethoxazole", atc: "J01EE01", atc4: "J01EE", className: "Sulfonamides", category: "Antibacterial", synonyms: ["cotrimoxazole", "co trimoxazole", "septrin", "bactrim"] },
  { ingredient: "trimethoprim", atc: "J01EA01", atc4: "J01EA", className: "Trimethoprim", category: "Antibacterial" },
  { ingredient: "metronidazole", atc: "J01XD01", atc4: "J01XD", className: "Imidazoles", category: "Antibacterial", synonyms: ["flagyl"] },
  { ingredient: "nitrofurantoin", atc: "J01XE01", atc4: "J01XE", className: "Nitrofurans", category: "Antibacterial" },
  { ingredient: "gentamicin", atc: "J01GB03", atc4: "J01GB", className: "Aminoglycosides", category: "Antibacterial" },
  { ingredient: "rifampicin", atc: "J04AB02", atc4: "J04AB", className: "Rifamycins", category: "Antimycobacterial", synonyms: ["rifampin"] },
  { ingredient: "fluconazole", atc: "J02AC01", atc4: "J02AC", className: "Triazole antifungals", category: "Antifungal", synonyms: ["diflucan"] },
  // Metabolic
  { ingredient: "metformin", atc: "A10BA02", atc4: "A10BA", className: "Biguanides", category: "Antidiabetic", synonyms: ["glucophage"] },
  { ingredient: "glibenclamide", atc: "A10BB01", atc4: "A10BB", className: "Sulfonylureas", category: "Antidiabetic", synonyms: ["glyburide", "daonil"] },
  { ingredient: "gliclazide", atc: "A10BB09", atc4: "A10BB", className: "Sulfonylureas", category: "Antidiabetic", synonyms: ["diamicron"] },
  { ingredient: "insulin", atc: "A10AB01", atc4: "A10AB", className: "Insulins", category: "Antidiabetic" },
  { ingredient: "potassium chloride", atc: "A12BA01", atc4: "A12BA", className: "Potassium supplements", category: "Electrolyte", synonyms: ["slow k", "kcl"] },
  { ingredient: "omeprazole", atc: "A02BC01", atc4: "A02BC", className: "Proton pump inhibitors", category: "GI", synonyms: ["losec"] },
  { ingredient: "esomeprazole", atc: "A02BC05", atc4: "A02BC", className: "Proton pump inhibitors", category: "GI", synonyms: ["nexium"] },
  { ingredient: "methotrexate", atc: "L01BA01", atc4: "L01BA", className: "Folic acid analogues", category: "Antineoplastic" },
  { ingredient: "allopurinol", atc: "M04AA01", atc4: "M04AA", className: "Xanthine oxidase inhibitors", category: "Antigout", synonyms: ["zyloric"] },
  { ingredient: "sildenafil", atc: "G04BE03", atc4: "G04BE", className: "PDE5 inhibitors", category: "Urological", synonyms: ["viagra"] },
  { ingredient: "glyceryl trinitrate", atc: "C01DA02", atc4: "C01DA", className: "Organic nitrates", category: "Cardiovascular", synonyms: ["gtn", "nitroglycerin"] },
  { ingredient: "isosorbide", atc: "C01DA08", atc4: "C01DA", className: "Organic nitrates", category: "Cardiovascular" },
];

export type RuleSeverity = "contraindicated" | "major" | "moderate" | "minor";

export interface ClassInteractionRule {
  id: string;
  a: string[]; // ATC4 codes or category keys ("cat:NSAID")
  b: string[];
  severity: RuleSeverity;
  mechanism: string;
  consequence: string;
  action: string;
  evidence: "A" | "B" | "C";
  alternatives?: string[];
}

export const CLASS_INTERACTIONS: ClassInteractionRule[] = [
  { id: "ACEI-ARB", a: ["C09AA"], b: ["C09CA"], severity: "contraindicated", mechanism: "Dual renin–angiotensin blockade.", consequence: "Hyperkalaemia, hypotension and acute kidney injury without outcome benefit (ONTARGET, VA NEPHRON-D).", action: "Do not combine. Use a single RAS agent at optimal dose.", evidence: "A", alternatives: ["amlodipine", "hydrochlorothiazide"] },
  { id: "SSRI-MAOI", a: ["N06AB"], b: ["N06AF", "N04BD", "J01XX"], severity: "contraindicated", mechanism: "Additive serotonergic activity.", consequence: "Serotonin syndrome — hyperthermia, rigidity, seizures, death.", action: "Contraindicated. Allow 2-week washout (5 weeks after fluoxetine).", evidence: "A" },
  { id: "OPIOID-MAOI", a: ["N02AB", "N02AX"], b: ["N06AF", "N04BD"], severity: "contraindicated", mechanism: "Serotonergic toxicity with pethidine/tramadol.", consequence: "Serotonin syndrome, hypertensive crisis.", action: "Avoid. Use morphine with extreme caution if analgesia required.", evidence: "B" },
  { id: "NSAID-ANTICOAG", a: ["cat:NSAID", "N02BA"], b: ["B01AA", "B01AF", "B01AB"], severity: "major", mechanism: "Platelet inhibition and gastric mucosal injury plus anticoagulation.", consequence: "Serious GI and intracranial bleeding.", action: "Avoid; use paracetamol for analgesia. If unavoidable, add PPI and monitor INR/Hb.", evidence: "A", alternatives: ["paracetamol"] },
  { id: "ANTICOAG-DUP", a: ["B01AA", "B01AF"], b: ["B01AA", "B01AF"], severity: "contraindicated", mechanism: "Duplicate oral anticoagulation.", consequence: "Major haemorrhage.", action: "Never combine two oral anticoagulants.", evidence: "A" },
  { id: "NSAID-ACEI-DIUR", a: ["cat:NSAID"], b: ["C09AA", "C09CA", "C03CA", "C03AA"], severity: "moderate", mechanism: "Prostaglandin inhibition reduces renal perfusion.", consequence: "Reduced antihypertensive effect; AKI ('triple whammy' with diuretic).", action: "Monitor creatinine and BP; prefer paracetamol.", evidence: "B", alternatives: ["paracetamol"] },
  { id: "RAS-KSPARE", a: ["C09AA", "C09CA"], b: ["C03DA", "C03DB", "A12BA"], severity: "major", mechanism: "Reduced aldosterone plus potassium retention/supply.", consequence: "Life-threatening hyperkalaemia.", action: "Check K+ and creatinine within 1 week; avoid if eGFR < 30.", evidence: "A" },
  { id: "WARF-MACRO-AZOLE", a: ["B01AA"], b: ["J01FA", "J02AC", "J01XD", "J01EE", "J01MA"], severity: "major", mechanism: "CYP2C9/3A4 inhibition raises warfarin levels.", consequence: "INR elevation and bleeding.", action: "Check INR within 3–5 days; consider empiric dose reduction.", evidence: "A" },
  { id: "STATIN-MACRO", a: ["C10AA"], b: ["J01FA", "J02AC"], severity: "major", mechanism: "CYP3A4 inhibition (simvastatin/atorvastatin).", consequence: "Myopathy and rhabdomyolysis.", action: "Withhold statin during the antibiotic course or use azithromycin.", evidence: "B", alternatives: ["azithromycin"] },
  { id: "BENZO-OPIOID", a: ["N05BA", "N05CD"], b: ["N02AA", "N02AB", "N02AJ", "N02AX"], severity: "major", mechanism: "Additive CNS and respiratory depression.", consequence: "Respiratory arrest, death (FDA boxed warning).", action: "Avoid co-prescription; lowest doses and naloxone availability if unavoidable.", evidence: "A" },
  { id: "PDE5-NITRATE", a: ["G04BE"], b: ["C01DA"], severity: "contraindicated", mechanism: "Synergistic cGMP-mediated vasodilation.", consequence: "Profound refractory hypotension, MI.", action: "Contraindicated.", evidence: "A" },
  { id: "MTX-TMP", a: ["L01BA"], b: ["J01EE", "J01EA"], severity: "contraindicated", mechanism: "Additive antifolate effect, reduced renal clearance.", consequence: "Pancytopenia, fatal bone-marrow suppression.", action: "Do not combine; choose an alternative antibiotic.", evidence: "A" },
  { id: "RIF-INDUCER", a: ["J04AB"], b: ["B01AA", "B01AF", "A10BB"], severity: "major", mechanism: "Potent CYP induction.", consequence: "Loss of anticoagulant/hypoglycaemic effect.", action: "Monitor closely; dose adjustment or alternative required.", evidence: "A" },
  { id: "QT-FQ-MACRO", a: ["J01MA"], b: ["J01FA"], severity: "moderate", mechanism: "Additive QT prolongation.", consequence: "Torsades de pointes.", action: "ECG baseline; avoid in known long QT.", evidence: "B" },
  { id: "DIGOXIN-DIUR", a: ["C01AA"], b: ["C03CA", "C03AA"], severity: "moderate", mechanism: "Diuretic-induced hypokalaemia potentiates digoxin.", consequence: "Digoxin toxicity, arrhythmia.", action: "Monitor K+ and digoxin level.", evidence: "B" },
  { id: "SSRI-NSAID", a: ["N06AB"], b: ["cat:NSAID", "N02BA"], severity: "moderate", mechanism: "Serotonin depletion in platelets plus GI injury.", consequence: "Upper GI bleeding.", action: "Add PPI gastroprotection.", evidence: "B" },
];

export interface CrossReactivity {
  allergenClass: string;
  allergenAliases: string[]; // free-text allergy terms
  crossClass: string; // ATC4 code or className
  risk: number; // %
  guidance: string;
  indicator: "critical" | "warning";
}

export const CROSS_REACTIVITY: CrossReactivity[] = [
  { allergenClass: "Penicillins", allergenAliases: ["penicillin", "penicillins", "pcn", "amoxicillin", "augmentin", "ampicillin", "beta lactam"], crossClass: "Penicillins", risk: 100, guidance: "Same molecular class — do not administer.", indicator: "critical" },
  { allergenClass: "Penicillins", allergenAliases: ["penicillin", "penicillins", "pcn", "amoxicillin", "ampicillin"], crossClass: "Cephalosporins 1st Gen", risk: 2, guidance: "Shared R1 side chains (cefalexin/amoxicillin). Avoid after anaphylaxis; acceptable after remote mild rash.", indicator: "warning" },
  { allergenClass: "Penicillins", allergenAliases: ["penicillin", "penicillins", "pcn"], crossClass: "Cephalosporins 2nd Gen", risk: 1, guidance: "Low cross-reactivity. Use with monitoring unless history of anaphylaxis.", indicator: "warning" },
  { allergenClass: "Penicillins", allergenAliases: ["penicillin", "penicillins", "pcn"], crossClass: "Cephalosporins 3rd Gen", risk: 1, guidance: "Very low cross-reactivity (<1%). First dose under observation.", indicator: "warning" },
  { allergenClass: "Penicillins", allergenAliases: ["penicillin", "penicillins", "pcn"], crossClass: "Carbapenems", risk: 1, guidance: "<1% cross-reactivity. Test dose if severe history.", indicator: "warning" },
  { allergenClass: "Cephalosporins", allergenAliases: ["cephalosporin", "cephalosporins", "ceftriaxone", "cefalexin", "cephalexin", "cefuroxime"], crossClass: "Cephalosporins 1st Gen", risk: 100, guidance: "Cephalosporin class allergy.", indicator: "critical" },
  { allergenClass: "Cephalosporins", allergenAliases: ["cephalosporin", "cephalosporins", "ceftriaxone", "cefalexin", "cephalexin", "cefuroxime"], crossClass: "Cephalosporins 2nd Gen", risk: 100, guidance: "Cephalosporin class allergy.", indicator: "critical" },
  { allergenClass: "Cephalosporins", allergenAliases: ["cephalosporin", "cephalosporins", "ceftriaxone", "cefalexin", "cephalexin", "cefuroxime"], crossClass: "Cephalosporins 3rd Gen", risk: 100, guidance: "Cephalosporin class allergy.", indicator: "critical" },
  { allergenClass: "Sulfonamide antibiotics", allergenAliases: ["sulfa", "sulpha", "sulfonamide", "sulphonamide", "septrin", "bactrim", "cotrimoxazole"], crossClass: "Sulfonamides", risk: 100, guidance: "Sulfonamide antibiotic allergy — do not administer.", indicator: "critical" },
  { allergenClass: "NSAIDs / Aspirin", allergenAliases: ["nsaid", "nsaids", "aspirin", "ibuprofen", "diclofenac", "brufen"], crossClass: "cat:NSAID", risk: 25, guidance: "NSAID-exacerbated respiratory disease / urticaria cross-reacts across COX-1 inhibitors. COX-2 selective agents are usually tolerated.", indicator: "critical" },
  { allergenClass: "NSAIDs / Aspirin", allergenAliases: ["nsaid", "nsaids", "aspirin", "ibuprofen", "diclofenac"], crossClass: "N02BA", risk: 25, guidance: "Aspirin cross-reacts with non-selective NSAIDs.", indicator: "critical" },
  { allergenClass: "Macrolides", allergenAliases: ["macrolide", "erythromycin", "clarithromycin", "azithromycin"], crossClass: "Macrolides", risk: 100, guidance: "Macrolide class allergy.", indicator: "critical" },
  { allergenClass: "Fluoroquinolones", allergenAliases: ["quinolone", "fluoroquinolone", "ciprofloxacin", "cipro"], crossClass: "Fluoroquinolones", risk: 100, guidance: "Fluoroquinolone class allergy.", indicator: "critical" },
  { allergenClass: "Opioids", allergenAliases: ["codeine", "morphine", "opioid", "opiate", "tramadol"], crossClass: "Opioids", risk: 10, guidance: "Many opioid 'allergies' are pseudo-allergic histamine release; confirm reaction type.", indicator: "warning" },
  { allergenClass: "Aromatic anticonvulsants", allergenAliases: ["carbamazepine", "phenytoin", "tegretol"], crossClass: "N03AB", risk: 40, guidance: "Aromatic anticonvulsant hypersensitivity (SJS/TEN/DRESS) cross-reacts.", indicator: "critical" },
  { allergenClass: "Aromatic anticonvulsants", allergenAliases: ["carbamazepine", "phenytoin", "tegretol"], crossClass: "N03AF", risk: 40, guidance: "Aromatic anticonvulsant hypersensitivity (SJS/TEN/DRESS) cross-reacts.", indicator: "critical" },
];

export interface DoseLimitRule {
  id: string;
  match: string[]; // ingredient names or ATC4 or cat:
  kind: "renal" | "age-min" | "age-elderly";
  egfrBelow?: number;
  ageBelow?: number;
  ageAtLeast?: number;
  indicator: "critical" | "warning" | "info";
  summary: string;
  detail: string;
  alternatives?: string[];
}

export const DOSE_RULES: DoseLimitRule[] = [
  { id: "METFORMIN-EGFR30", match: ["metformin"], kind: "renal", egfrBelow: 30, indicator: "critical", summary: "Metformin contraindicated: eGFR < 30", detail: "Risk of lactic acidosis.", alternatives: ["gliclazide", "insulin"] },
  { id: "METFORMIN-EGFR45", match: ["metformin"], kind: "renal", egfrBelow: 45, indicator: "warning", summary: "Metformin: reduce dose (eGFR 30–44)", detail: "Maximum 1 g/day; review renal function every 3–6 months." },
  { id: "NITRO-EGFR45", match: ["nitrofurantoin"], kind: "renal", egfrBelow: 45, indicator: "critical", summary: "Nitrofurantoin ineffective/toxic at eGFR < 45", detail: "Inadequate urinary concentration and risk of neuropathy.", alternatives: ["cefalexin"] },
  { id: "NSAID-EGFR30", match: ["cat:NSAID"], kind: "renal", egfrBelow: 30, indicator: "critical", summary: "NSAID contraindicated in severe renal impairment", detail: "eGFR < 30 — risk of irreversible renal injury.", alternatives: ["paracetamol"] },
  { id: "NSAID-EGFR60", match: ["cat:NSAID"], kind: "renal", egfrBelow: 60, indicator: "warning", summary: "NSAID in CKD stage 3", detail: "Use lowest dose for shortest duration; monitor creatinine." },
  { id: "DOAC-EGFR15", match: ["B01AF"], kind: "renal", egfrBelow: 15, indicator: "critical", summary: "Factor Xa inhibitor not recommended at eGFR < 15", detail: "Accumulation and bleeding risk." },
  { id: "GENTA-EGFR60", match: ["gentamicin"], kind: "renal", egfrBelow: 60, indicator: "warning", summary: "Aminoglycoside in renal impairment", detail: "Extend interval and monitor trough levels." },
  { id: "KSPARE-EGFR30", match: ["C03DA", "C03DB", "A12BA"], kind: "renal", egfrBelow: 30, indicator: "critical", summary: "Potassium-retaining agent at eGFR < 30", detail: "High risk of fatal hyperkalaemia." },
  { id: "ASPIRIN-CHILD", match: ["aspirin"], kind: "age-min", ageBelow: 16, indicator: "critical", summary: "Aspirin contraindicated under 16 years", detail: "Risk of Reye's syndrome.", alternatives: ["paracetamol", "ibuprofen"] },
  { id: "CODEINE-CHILD", match: ["codeine", "tramadol"], kind: "age-min", ageBelow: 12, indicator: "critical", summary: "Codeine/tramadol contraindicated under 12 years", detail: "Ultra-rapid CYP2D6 metabolism — fatal respiratory depression.", alternatives: ["paracetamol", "ibuprofen"] },
  { id: "TETRA-CHILD", match: ["J01AA"], kind: "age-min", ageBelow: 8, indicator: "critical", summary: "Tetracycline under 8 years", detail: "Permanent tooth discolouration and enamel hypoplasia.", alternatives: ["amoxicillin", "azithromycin"] },
  { id: "FQ-CHILD", match: ["J01MA"], kind: "age-min", ageBelow: 18, indicator: "warning", summary: "Fluoroquinolone under 18 years", detail: "Arthropathy risk; reserve for no-alternative infections." },
  { id: "BENZO-ELDERLY", match: ["N05BA", "N05CD"], kind: "age-elderly", ageAtLeast: 65, indicator: "warning", summary: "Benzodiazepine in patient ≥ 65 (Beers criteria)", detail: "Falls, fractures, delirium and cognitive impairment." },
  { id: "TCA-ELDERLY", match: ["N06AA"], kind: "age-elderly", ageAtLeast: 65, indicator: "warning", summary: "Tricyclic in patient ≥ 65 (Beers criteria)", detail: "Strongly anticholinergic — confusion, retention, orthostasis." },
  { id: "SU-ELDERLY", match: ["glibenclamide"], kind: "age-elderly", ageAtLeast: 65, indicator: "warning", summary: "Glibenclamide in patient ≥ 65 (Beers criteria)", detail: "Prolonged hypoglycaemia.", alternatives: ["gliclazide"] },
  { id: "NSAID-ELDERLY", match: ["cat:NSAID"], kind: "age-elderly", ageAtLeast: 75, indicator: "info", summary: "NSAID in patient ≥ 75", detail: "Monitor renal function and consider PPI gastroprotection." },
  { id: "WARFARIN-INR", match: ["B01AA"], kind: "age-elderly", ageAtLeast: 0, indicator: "info", summary: "Warfarin: INR monitoring required", detail: "Target INR 2–3 for most indications; check within 5 days of any change." },
];

// --- Resolution -----------------------------------------------------------

const normalise = (s: string) =>
  ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

const hasWord = (hay: string, term: string) => hay.includes(` ${normalise(term).trim()} `);

export interface ResolvedDrug {
  input: string;
  ingredients: IngredientConcept[];
}

/** Resolve a free-text / brand / combination product to its active ingredients. */
export function resolveDrug(name: string): ResolvedDrug {
  const hay = normalise(name);
  const found = INGREDIENTS.filter(
    (c) => hasWord(hay, c.ingredient) || (c.synonyms ?? []).some((s) => hasWord(hay, s)),
  );
  // Co-amoxiclav / augmentin always contains amoxicillin.
  if (found.some((f) => f.ingredient === "clavulanic acid") && !found.some((f) => f.ingredient === "amoxicillin")) {
    found.push(INGREDIENTS.find((i) => i.ingredient === "amoxicillin")!);
  }
  if (found.some((f) => f.ingredient === "sulfamethoxazole") && !found.some((f) => f.ingredient === "trimethoprim")) {
    found.push(INGREDIENTS.find((i) => i.ingredient === "trimethoprim")!);
  }
  return { input: name, ingredients: Array.from(new Set(found)) };
}

/** True when an ingredient belongs to any of the given class keys. */
export function inClass(c: IngredientConcept, keys: string[]): boolean {
  return keys.some((k) =>
    k.startsWith("cat:")
      ? c.category === k.slice(4)
      : k === c.atc4 || k === c.atc || k === c.className || k === c.ingredient,
  );
}

export function allergyTermMatches(allergyText: string, alias: string) {
  return hasWord(normalise(allergyText), alias);
}
