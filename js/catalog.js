/**
 * Loads and sanity-checks data/catalog.json.
 * Everything the app serves lives in that file — this module is the only thing
 * that knows its shape, so a bad edit fails loudly instead of half-working.
 */

const CATALOG_URL = "data/catalog.json";

export async function loadCatalog(){
  let res;
  try{
    res = await fetch(CATALOG_URL, { cache: "no-cache" });
  }catch{
    throw new Error("Can't reach the pantry. Check your connection.");
  }
  if(!res.ok) throw new Error("Catalog missing (HTTP " + res.status + ").");

  let data;
  try{
    data = await res.json();
  }catch{
    throw new Error("catalog.json isn't valid JSON — check for a stray comma.");
  }
  return validate(data);
}

function validate(data){
  const lengths = arr(data.lengths, "lengths");
  const moods   = arr(data.moods, "moods");
  const videos  = arr(data.videos, "videos");

  const moodIds = new Set(moods.map(m => m.id));
  const orphan = videos.find(v => !moodIds.has(v.mood));
  if(orphan) throw new Error('"' + orphan.title + '" has an unknown mood: ' + orphan.mood);

  const empty = moods.find(m => !videos.some(v => v.mood === m.id));
  if(empty) throw new Error('The "' + empty.label + '" mood has no videos.');

  return {
    lengths,
    moods,
    videos,
    defaultLen: (lengths.find(l => l.default) || lengths[0]).minutes,
    defaultMood: (moods.find(m => m.default) || moods[0]).id,
  };
}

function arr(v, name){
  if(!Array.isArray(v) || !v.length) throw new Error("catalog.json needs a non-empty " + name + " list.");
  return v;
}
