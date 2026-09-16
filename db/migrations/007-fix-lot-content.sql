-- Correct the description, source_url and (where supplied) position-1 image for
-- eight lots whose seed content was generated from the wrong Wikipedia article
-- (e.g. the Gio Ponti Superleggera chair described Aston Martin coachwork).
-- Idempotent: fixed-value UPDATEs keyed on title + artist.

BEGIN;

UPDATE lots SET description = $$Gio Ponti's Superleggera ('super-light') chair, model 699, designed for Cassina in 1957 and derived from the traditional Chiavari chair. The ash frame with its triangular-section legs weighs only 1.7 kg, light enough to lift with one finger, yet is famously robust: Cassina's advertising showed it being thrown from a fourth-floor window and bouncing. Offered as a pair with woven cane seats.$$, source_url = $$https://en.wikipedia.org/wiki/Gio_Ponti$$ WHERE title = $$Superleggera chair, model 699, pair$$ AND artist = $$Gio Ponti$$;

UPDATE lot_images SET url = $$https://upload.wikimedia.org/wikipedia/commons/8/86/Gio_Ponti%2C_Chaise_Superleggera%2C_1955.jpg$$, credit = $$Wikimedia Commons, public domain$$ WHERE position = 1 AND lot_id IN (SELECT id FROM lots WHERE title = $$Superleggera chair, model 699, pair$$ AND artist = $$Gio Ponti$$);

UPDATE lots SET description = $$Pelagos is a sculpture by British artist Barbara Hepworth, made in 1946 from elm wood with strings, mounted on a square oak base. It measures 43 cm × 46 cm × 38.5 cm and weighs about 15.2 kg (34 lb). Its spiralling hollowed form, painted pale blue inside and strung with taut cords, was inspired by the view of the bay at St Ives. The original has been held by the Tate gallery since 1964.$$, source_url = $$https://en.wikipedia.org/wiki/Pelagos_(Hepworth)$$ WHERE title = $$Pelagos$$ AND artist = $$Barbara Hepworth$$;

UPDATE lot_images SET url = $$https://upload.wikimedia.org/wikipedia/commons/5/55/London%2C_England_%2832359887934%29.jpg$$, credit = $$Wikimedia Commons$$ WHERE position = 1 AND lot_id IN (SELECT id FROM lots WHERE title = $$Pelagos$$ AND artist = $$Barbara Hepworth$$);

UPDATE lots SET description = $$Merry-Go-Round is a large oil on canvas painting made by Mark Gertler in September 1916, when he was 24 years old. It is perhaps his most famous work, and depicts men and women — several in uniform — on a merry-go-round ride, mouths open in a frozen scream. The painting may have been inspired by a ride at the annual fair on Hampstead Heath and is widely read as a response to the First World War. The original is held in Tate Britain.$$, source_url = $$https://en.wikipedia.org/wiki/Merry-Go-Round_(Gertler_painting)$$ WHERE title = $$Merry-Go-Round$$ AND artist = $$Mark Gertler$$;

UPDATE lot_images SET url = $$https://upload.wikimedia.org/wikipedia/commons/a/ac/Mark_Gertler_-_Merry-Go-Round_-_Google_Art_Project.jpg$$, credit = $$Wikimedia Commons, public domain$$ WHERE position = 1 AND lot_id IN (SELECT id FROM lots WHERE title = $$Merry-Go-Round$$ AND artist = $$Mark Gertler$$);

UPDATE lots SET description = $$Swan Upping at Cookham (1915–19) by Stanley Spencer shows the annual Thames ceremony in which swans are rounded up and marked, set beside Cookham Bridge in the artist's home village. Spencer began the canvas before serving in the First World War and finished the lower part on his return in 1919, later saying the unfinished picture had haunted him throughout the war. The original is in Tate Britain.$$, source_url = $$https://en.wikipedia.org/wiki/Stanley_Spencer$$ WHERE title = $$Swan Upping at Cookham$$ AND artist = $$Stanley Spencer$$;

UPDATE lot_images SET url = $$https://upload.wikimedia.org/wikipedia/commons/b/b1/Queen%27s_Swan_Uppers.jpg$$, credit = $$Wikimedia Commons (swan upping on the Thames; illustrative)$$ WHERE position = 1 AND lot_id IN (SELECT id FROM lots WHERE title = $$Swan Upping at Cookham$$ AND artist = $$Stanley Spencer$$);

UPDATE lots SET description = $$Travoys Arriving with Wounded at a Dressing-Station at Smol, Macedonia, September 1916 (1919) is Stanley Spencer's official war painting, commissioned by the British War Memorials Committee. Mule-drawn travoys carrying wounded men converge on a lamplit operating theatre in a former Greek church, a scene Spencer witnessed while serving with the Royal Army Medical Corps in Salonika. The original is in the Imperial War Museum, London.$$, source_url = $$https://en.wikipedia.org/wiki/Stanley_Spencer$$ WHERE title = $$Travoys Arriving with Wounded at a Dressing-Station$$ AND artist = $$Stanley Spencer$$;

UPDATE lots SET description = $$The Resurrection, Cookham (1924–27) is Stanley Spencer's monumental canvas, some 2.7 by 5.5 metres, in which the dead rise from their graves in the churchyard of Holy Trinity, Cookham. Spencer painted himself, his wife Hilda and friends among the resurrected; God and Christ appear in the church porch. Hailed on exhibition in 1927 as the most important picture painted by an English artist that century, the original hangs in Tate Britain.$$, source_url = $$https://en.wikipedia.org/wiki/Stanley_Spencer$$ WHERE title = $$The Resurrection, Cookham$$ AND artist = $$Stanley Spencer$$;

UPDATE lot_images SET url = $$https://upload.wikimedia.org/wikipedia/commons/f/f6/Cookham_church%2Cberkshire.JPG$$, credit = $$Wikimedia Commons (Holy Trinity church, Cookham; illustrative)$$ WHERE position = 1 AND lot_id IN (SELECT id FROM lots WHERE title = $$The Resurrection, Cookham$$ AND artist = $$Stanley Spencer$$);

UPDATE lots SET description = $$Burners (1940) is the first of Stanley Spencer's Shipbuilding on the Clyde series, painted for the War Artists' Advisory Committee at Lithgows' yard in Port Glasgow. The triptych shows men crouched over steel plates with cutting torches, their bodies folded into the curves of the metal, in Spencer's densely packed and tender record of wartime industrial labour. The original series is in the Imperial War Museum, London.$$, source_url = $$https://en.wikipedia.org/wiki/Stanley_Spencer$$ WHERE title = $$Shipbuilding on the Clyde: Burners$$ AND artist = $$Stanley Spencer$$;

UPDATE lot_images SET url = $$https://upload.wikimedia.org/wikipedia/commons/3/3d/Port_Glasgow.jpg$$, credit = $$Wikimedia Commons (Port Glasgow; illustrative)$$ WHERE position = 1 AND lot_id IN (SELECT id FROM lots WHERE title = $$Shipbuilding on the Clyde: Burners$$ AND artist = $$Stanley Spencer$$);

UPDATE lots SET description = $$Workshop (c. 1914–15) is one of the few surviving Vorticist paintings by Wyndham Lewis, founder of the movement and editor of its magazine Blast. Jagged, tilted planes in acid pinks, yellows and greens evoke the hard geometry of the modern city and the machine age. The original is in Tate Britain.$$, source_url = $$https://en.wikipedia.org/wiki/Wyndham_Lewis$$ WHERE title = $$Workshop$$ AND artist = $$Wyndham Lewis$$;

COMMIT;
