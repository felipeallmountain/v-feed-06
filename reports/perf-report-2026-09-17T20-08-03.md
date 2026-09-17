# V-FEED [06] — Performance & Longevity Test Report

> **Test Session ID**: `2026-09-17T15-38-01-155Z`  
> **Date**: 9/17/2026  
> **Total Duration**: **04:30:02** (16202 seconds)  
> **Test Note**: Interactive CLI test session on 9/17/2026, 10:38:01 AM  

---

## 1. Executive Summary

### Longevity Verdict: **🟡 CAUTION: HIGH QUOTA CONSUMPTION**
Quota burn rate is 919.9 units/hr. At this pace, daily quota will be exhausted in ~5.3 hours. Consider increasing cache TTL or dialing down search query frequency.

| Metric Category | Measured Result | Operational Threshold / Note |
| :--- | :--- | :--- |
| **Total Test Duration** | **04:30:02** | Multi-hour continuous run |
| **Total YouTube API HTTP Calls** | **81** calls | Calls hitting Google API v3 |
| **YouTube Quota Units Burned** | **4140** units | Daily limit: 9,000 units |
| **Average Quota Burn Rate** | **919.9 units/hr** | 8h gallery budget: ~1,125 units/hr |
| **Estimated Quota Runway** | **~5.3 hours** | Until 10,000 unit daily limit |
| **Local Cache Hits** | **184** hits | 0 quota units consumed |
| **Videos Saved During Test** | **313** video(s) | Downloaded & transcoded via yt-dlp |
| **Storage Added During Test** | **49.3 MB** | Net disk growth |
| **Current Storage Footprint** | **102.0 MB** / 500 MB (20.4%) | Auto-prune ceiling: 500 MB |
| **Storage Growth Rate** | **11 MB/hr** | Storage cap runway: ~36.2 hrs |
| **Host Process Memory (RSS)** | **125.1 MB** (Heap: 19.3 MB) | Stable Node.js runtime |

---

## 2. YouTube Data API v3 Traffic Analysis

| API Endpoint / Action | Cost (Units) | Call Count | Total Units | Share of Quota |
| :--- | :--- | :--- | :--- | :--- |
| `search.list` (Vertical Shorts Query) | 100 units | 41 | 4100 units | 99% |
| `videos.list` (Metadata & Duration) | 1 unit/page | 40 | 40 units | 1% |
| `playlistItems.list` (Curated Ingestion) | 1 unit/page | 0 | 0 units | 0% |
| **Local Disk Cache Hits** | 0 units | **184** | 0 units | **18,400 units saved!** |
| **Total API Requests** | — | **81** | **4140** | 100% |

### API Reliability
- **Successful Requests**: 81 / 81
- **API Errors**: 0
- **Cache Efficiency**: 69% of all requests served locally without internet/quota cost.

---

## 3. Video Ingestion & Storage Footprint

- **Starting Video Count**: 8
- **Ending Video Count**: 61
- **Net Videos Ingested**: 313
- **Starting Storage**: 52.7 MB
- **Current Storage**: 102.0 MB (out of 500 MB capacity)
- **Average Video File Size**: 2.0 MB
- **Smallest Video**: 166.4 KB
- **Largest Video**: 15.4 MB
- **Storage Pruning Events**: 20 event(s)

### Videos Downloaded During Test (313 items)

| # | Video ID | Title | Channel | Duration | Size | Download Time | Query / Trigger |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `I9fSWSpsmYE` | Tarzan Triumphs Movie Scene - Tarzan | Warner Bros. Class | 1:08 | **5.6 MB** | 10s | `classic cinema 80s 90s m` |
| 2 | `dUfREXKyt5U` | Charade - Audrey Hepburn - #HerStory | Universal Pictures | 0:09 | **551.2 KB** | 4s | `classic cinema 80s 90s m` |
| 3 | `rLDEiHKUlL8` | the moment TV switched to color 😲 # | Extraordinaries | 0:38 | **1.7 MB** | 6s | `#shorts 1960s news sign ` |
| 4 | `onGdcH0vW50` | Worst line in movie history | BlackLabelExpat | 0:20 | **402.2 KB** | 4s | `#shorts 1970s television` |
| 5 | `_jQ5JjvDtKA` | The BEST TIMED Shot in TV HISTORY? | BBC Archive | 0:42 | **1.6 MB** | 5s | `#shorts 1970s television` |
| 6 | `jnPE8u5ONls` | If I Were the Devil by Paul Harvey - | Brad Dison | 3:27 | **10.3 MB** | 10s | `#shorts 1970s television` |
| 7 | `AauSFpPuCX4` | American Graffiti (1973) - Wolfman J | Movieclips | 3:00 | **8.2 MB** | 10s | `#shorts 1970s television` |
| 8 | `A-mO7rbYtgk` | The Queen's sense of humour remember | Guardian News | 3:49 | **7.7 MB** | 11s | `#shorts 1970s television` |
| 9 | `9K041di8DD8` | The UK Emergency Alert but for Teach | Twinkl Educational | 0:12 | **508.9 KB** | 4s | `#shorts vintage emergenc` |
| 10 | `GczlQqrPZLk` | Hurricane simulators are no joke 👀� | House of Highlight | 0:24 | **1.1 MB** | 5s | `#shorts vintage emergenc` |
| 11 | `SZgJLyGJIik` | Their Boat Engine Fell Off | Newsflare | 0:13 | **750.9 KB** | 5s | `#shorts vintage emergenc` |
| 12 | `qwmRvwdlVEk` | Evolution of School Bus {1980~2023}  | MGC Tube | 0:26 | **1.2 MB** | 5s | `#shorts vintage emergenc` |
| 13 | `JAAO8hKtmAw` | If Airlines Were People #shorts | Charlie Berens | 0:53 | **3.0 MB** | 6s | `#shorts vintage emergenc` |
| 14 | `5JsMJ42rQYY` | When Street Interviews Go Wrong (195 | Frontline by ITN | 0:28 | **2.0 MB** | 5s | `#shorts 1980s broadcast ` |
| 15 | `XCa5Lbqf8rE` | Possibly the smoothest moonwalk ever | ZebraMan Studios | 0:12 | **499.0 KB** | 5s | `#shorts 1980s broadcast ` |
| 16 | `b_urLBQ5WG4` | When Paul McCartney Did Comedy with  | Zen no Chikara | 0:27 | **1.9 MB** | 5s | `#shorts 1980s broadcast ` |
| 17 | `NPZmKmXuylg` | 🌊🚤 Don’t you just love the motion  | TheMaryBurke | 0:15 | **610.9 KB** | 5s | `#shorts 1980s broadcast ` |
| 18 | `LvGgYcpSi8U` | What is An Attractive Man? Ireland 1 | CR's Video Vaults | 3:07 | **6.0 MB** | 5s | `#shorts 1980s broadcast ` |
| 19 | `i-okxLuAv-E` | A.I. Family Guy as 80s Sitcom #short | Nifty Nanners | 0:45 | **1.9 MB** | 5s | `#shorts vintage televisi` |
| 20 | `CKjXmNPZGso` | WORLD'S LONGEST ARMS.. #Shorts | SerumShorts | 0:13 | **1.1 MB** | 6s | `#shorts vintage televisi` |
| 21 | `wwj6P_BRFFE` | Family Guy - Trump supporters | Mr. Rupert | 0:51 | **3.5 MB** | 5s | `#shorts vintage televisi` |
| 22 | `r5fFlI7MFeM` | Sonny & Cher "I Got You Babe" on The | The Ed Sullivan Sh | 1:06 | **2.9 MB** | 9s | `#shorts vintage late nig` |
| 23 | `nNsq51__Wzc` | POV: you’re 6’9” 400 pounds and book | Hafthor Bjornsson | 0:18 | **1005.2 KB** | 5s | `#shorts vintage late nig` |
| 24 | `8Zjvt9FIImE` | Terrible Acting Performances😭🎬#sho | NostalgiaSell | 0:22 | **1.5 MB** | 6s | `#shorts vintage late nig` |
| 25 | `3oZ4GQJZR9c` | Rule Britannia | Rule Britannia | 0:12 | **596.1 KB** | 5s | `#shorts national anthem ` |
| 26 | `Kuwp-c3QkSo` | George I russian  kid. #russia,#hard | Gyoneko - Fortnite | 0:08 | **166.4 KB** | 5s | `#shorts national anthem ` |
| 27 | `m0vPyINwTNw` | Spring Break 2021 Clearwater Beach F | Dr SulacoPhD | 0:09 | **713.4 KB** | 4s | `#shorts national anthem ` |
| 28 | `OUYVAUZ9Ww8` | WHO SANG “Anti-Hero” BEST?!?🎤🎃 #ta | Sharpe Family Sing | 0:42 | **3.0 MB** | 5s | `#shorts national anthem ` |
| 29 | `4OPK79597bQ` | Thalapathy vijay potical power 🤯🔥  | NANDHA EDITZ | 0:12 | **1.0 MB** | 5s | `#shorts national anthem ` |
| 30 | `qyx1kGlcnCA` | Memorable undressing scene, Carnival | FEATURE FILM | 0:24 | **1.0 MB** | 5s | `#shorts retro public acc` |
| 31 | `NkCoS0HnxTc` | THE COUNSELOR -  The Stockings Scene | A PERFECT LIFE MOM | 1:32 | **4.2 MB** | 4s | `#shorts retro public acc` |
| 32 | `XeldhceOkh0` | Great white shark washed up North Ca | KingNicoplayz | 0:14 | **419.2 KB** | 4s | `#shorts retro public acc` |
| 33 | `V8cH4pkPQw0` | Dave Chappelle - New White People (2 | Classic Comedy | 0:17 | **859.4 KB** | 4s | `#shorts retro public acc` |
| 34 | `p8XodAx2Q80` | Girl burnout on her drag bike | Harley Davidson Pe | 0:26 | **1.5 MB** | 5s | `#shorts retro public acc` |
| 35 | `CdaXTGsMU9A` | “SF vs. Boston” 🎤: Hanna Evensen -  | Don't Tell Comedy | 0:45 | **2.0 MB** | 4s | `#shorts 1970s television` |
| 36 | `5C_OD4k8nJo` | "Find me a part of America that's no | Comedy Central Sta | 0:57 | **2.0 MB** | 4s | `#shorts 1970s television` |
| 37 | `8E_KwRqt-dI` | There is stupid and then there is th | Coach Basics Baseb | 0:21 | **1.0 MB** | 4s | `#shorts vintage emergenc` |
| 38 | `ESvPcNA6rp0` | How to SINK your Boat #6 - Wavy Boat | Wavy Boats | 0:30 | **1.6 MB** | 4s | `#shorts vintage emergenc` |
| 39 | `0pwKwrBPpSg` | Different siren styles you’ll use re | Fire Department Ch | 0:16 | **691.9 KB** | 4s | `#shorts vintage emergenc` |
| 40 | `8kX9b9mqa8U` | I Blinked and This Happened | Rebecca Zamolo | 0:20 | **1.5 MB** | 4s | `#shorts 1980s broadcast ` |
| 41 | `GxsTJLCigRc` | Are churches still singing songs lik | Faith Holy Church | 0:44 | **2.1 MB** | 5s | `#shorts 1980s broadcast ` |
| 42 | `gx1bD-rdv5E` | Surgery with zero euro 😅🤷‍♀️ #shor | JessB! | 0:16 | **1008.7 KB** | 5s | `#shorts vintage late nig` |
| 43 | `YAL089viHi4` | Joe Biden - "It's called soccer" 🙈� | Footy Ranks - Kenn | 0:14 | **611.2 KB** | 6s | `#shorts vintage late nig` |
| 44 | `R7q9zjx1fB4` | Ringo Starr: It’s ‘impossible’ to pl | Associated Press | 0:43 | **2.2 MB** | 4s | `#shorts vintage late nig` |
| 45 | `je1zdgVJ0Ic` | OMG… THEY ATEEE 😍🤯 #cheer #stunts  | Divine Cheer | 0:18 | **1.6 MB** | 5s | `#shorts national anthem ` |
| 46 | `J8zg8ABTimU` | 1955 Break the Bank: Winning $500 wi | ShowShard | 0:51 | **3.4 MB** | 5s | `#shorts retro public acc` |
| 47 | `Npz0Ei5Uya4` | Flashback to The Castro in the 1970s | KQED | 0:49 | **2.9 MB** | 8s | `#shorts retro public acc` |
| 48 | `H9CvNZD9q60` | Soul Train 1974: Classic Moves & Gro | tomkkat | 0:19 | **1.3 MB** | 4s | `#shorts retro public acc` |
| 49 | `dv2XbOj51Mo` | Marcia Brady Went Braless #shorts #m | Facts Verse | 0:57 | **3.6 MB** | 5s | `#shorts retro public acc` |
| 50 | `fOOmJWqEQ0Y` | Kevin Hart can't stop attacking 'old | Peacock | 0:20 | **836.4 KB** | 4s | `#shorts retro public acc` |
| 51 | `BpRn9j_epKE` | children series that were banned#sch | ADORABLE Zone | 0:15 | **397.3 KB** | 4s | `#shorts 1980s television` |
| 52 | `52fWJGeMGfk` | The Darkest Conspiracy Theories…😳 # | STYT | 0:18 | **1.2 MB** | 5s | `#shorts 1980s television` |
| 53 | `98fk7MPPa3s` | Why SpongeBob's "Lost Episode" Walk  | Louaista | 1:00 | **4.3 MB** | 5s | `#shorts 1980s television` |
| 54 | `EqnUiEVgmAg` | Television RCA Sign off Alignment Te | Mystic Frequencies | 0:31 | **875.7 KB** | 8s | `#shorts vintage televisi` |
| 55 | `03e7lBEQNnM` | Evolution of Television (TV) - 1927  | Zaifi Evolution | 0:26 | **915.6 KB** | 4s | `#shorts vintage televisi` |
| 56 | `y8Qqm2DM_RI` | Philco Predicta: The 1950s TV That D | Big Score | 0:23 | **1.2 MB** | 5s | `#shorts vintage televisi` |
| 57 | `Y2vy96pDsG8` | Audio TV test pattern from the fifti | zokbones | 1:01 | **1.4 MB** | 4s | `#shorts vintage televisi` |
| 58 | `XuS1pcDi8Vg` | BOSTON TV Test Patterns 1980's , Par | MSTS1 | 2:04 | **7.0 MB** | 5s | `#shorts vintage televisi` |
| 59 | `sI4M4-AWLi4` | SpongeBob as an old timey cartoon! # | Nicktoons | 1:15 | **5.6 MB** | 7s | `#shorts national anthem ` |
| 60 | `HYfowmWzUMw` | The most racist video on the interne | KEEMOKAZI | 0:31 | **1.6 MB** | 5s | `#shorts national anthem ` |
| 61 | `rLDEiHKUlL8` | the moment TV switched to color 😲 # | Extraordinaries | 0:38 | **1.7 MB** | 9s | `#shorts retro color bars` |
| 62 | `Bk4Kk3i3_9w` | World’s HOTTEST Skateboard EVER!! | totallyanton | 0:21 | **1.5 MB** | 5s | `#shorts 1960s news sign ` |
| 63 | `neZlh6fhHtg` | Did I just find the most unsettling  | Levi McClain | 0:16 | **1.1 MB** | 4s | `#shorts 1960s news sign ` |
| 64 | `9fSYKdTLeZk` | The worst line on television ever. | Dimmary | 0:14 | **426.1 KB** | 5s | `#shorts 1970s television` |
| 65 | `jpF0S_mMcJY` | “Don’t Confuse Pretty Shots with Goo | Nate's Film Tutori | 0:21 | **1.5 MB** | 5s | `#shorts 1970s television` |
| 66 | `tS7Cn0IM02Y` | Cinematic Sound Effects (Royalty-Fre | Flame Sound | 1:17 | **3.1 MB** | 9s | `#shorts 1970s television` |
| 67 | `OHHNmj5pASI` | The brilliant Dave Allen 🤭 #comedia | Travelling Tim  | 0:54 | **1.6 MB** | 5s | `#shorts 1970s television` |
| 68 | `9K041di8DD8` | The UK Emergency Alert but for Teach | Twinkl Educational | 0:12 | **508.9 KB** | 4s | `#shorts vintage emergenc` |
| 69 | `GczlQqrPZLk` | Hurricane simulators are no joke 👀� | House of Highlight | 0:24 | **1.1 MB** | 5s | `#shorts vintage emergenc` |
| 70 | `SZgJLyGJIik` | Their Boat Engine Fell Off | Newsflare | 0:13 | **750.9 KB** | 5s | `#shorts vintage emergenc` |
| 71 | `qwmRvwdlVEk` | Evolution of School Bus {1980~2023}  | MGC Tube | 0:26 | **1.2 MB** | 4s | `#shorts vintage emergenc` |
| 72 | `JAAO8hKtmAw` | If Airlines Were People #shorts | Charlie Berens | 0:53 | **3.0 MB** | 5s | `#shorts vintage emergenc` |
| 73 | `NPZmKmXuylg` | 🌊🚤 Don’t you just love the motion  | TheMaryBurke | 0:15 | **610.9 KB** | 4s | `#shorts 1980s broadcast ` |
| 74 | `JVTHJ6O7MhM` | Sailboat Slammed by Massive Wave Dur | Wild Wild AI | 0:11 | **728.7 KB** | 4s | `#shorts 1980s broadcast ` |
| 75 | `HcBnSuq8b1o` | BOAT SINKING! FAMILY GOES INTO PANIC | Wavy Boats | 0:46 | **1.8 MB** | 6s | `#shorts 1980s broadcast ` |
| 76 | `Ub_GIR1jPz0` | This Surprise Guest Made Our Photosh | Ethoventures | 0:12 | **852.9 KB** | 5s | `#shorts retro public acc` |
| 77 | `XeV9o7YxMO8` | Tabassum gives a golden life lesson  | Lehren Retro | 0:27 | **2.0 MB** | 5s | `#shorts retro public acc` |
| 78 | `yF_vivTi9lQ` | Tell me I'm not the only one 😜 #sho | RowdyRogan | 0:11 | **666.2 KB** | 4s | `#shorts retro public acc` |
| 79 | `b_urLBQ5WG4` | When Paul McCartney Did Comedy with  | Zen no Chikara | 0:27 | **1.9 MB** | 5s | `#shorts 1980s broadcast ` |
| 80 | `GJSb_Xr-9AA` | No window, no problem with the Samsu | Next Upgrade | 0:16 | **669.4 KB** | 5s | `#shorts retro color bars` |
| 81 | `nNsq51__Wzc` | POV: you’re 6’9” 400 pounds and book | Hafthor Bjornsson | 0:18 | **1005.2 KB** | 5s | `#shorts 1960s news sign ` |
| 82 | `r5fFlI7MFeM` | Sonny & Cher "I Got You Babe" on The | The Ed Sullivan Sh | 1:06 | **2.9 MB** | 10s | `#shorts 1970s television` |
| 83 | `i-okxLuAv-E` | A.I. Family Guy as 80s Sitcom #short | Nifty Nanners | 0:45 | **1.9 MB** | 5s | `#shorts vintage televisi` |
| 84 | `CKjXmNPZGso` | WORLD'S LONGEST ARMS.. #Shorts | SerumShorts | 0:13 | **1.1 MB** | 5s | `#shorts vintage televisi` |
| 85 | `wwj6P_BRFFE` | Family Guy - Trump supporters | Mr. Rupert | 0:51 | **3.5 MB** | 5s | `#shorts vintage televisi` |
| 86 | `Stcr_UcDNaE` | The 'Truth' About Filipino Singers.. | Nico Blitz | 0:43 | **1.9 MB** | 8s | `#shorts vintage sitcom b` |
| 87 | `Ejl2duTSLSY` | Māori History in 1 Minute | Profiles of Countr | 0:47 | **3.3 MB** | 5s | `#shorts vintage sitcom b` |
| 88 | `mLYvEVAcgVQ` | Old Vs. New Cars Crash Test | MeDoMechanic | 0:14 | **1.2 MB** | 5s | `#shorts vintage sitcom b` |
| 89 | `UXInk1PCsc8` | Cab Calloway 1933 Cartoon of St. Jam | John Corda | 2:40 | **9.8 MB** | 11s | `#shorts classic buddy si` |
| 90 | `33W6IuyBybs` | Michael Jordan shows off his JORDANS | Hardwood Heat | 0:39 | **1.7 MB** | 5s | `#shorts classic buddy si` |
| 91 | `GwDpY6g5h-Y` | #golfswing #fyp #waitforit #followth | The Game Illustrat | 0:18 | **1.5 MB** | 4s | `#shorts 1970s game show ` |
| 92 | `jL_CLLezrZw` | Pontoon Boat hits big rock | Boaters List | 0:14 | **665.7 KB** | 4s | `#shorts 1970s game show ` |
| 93 | `onGdcH0vW50` | Worst line in movie history | BlackLabelExpat | 0:20 | **402.2 KB** | 5s | `#shorts 90s sitcom scene` |
| 94 | `DN0WfyjjqH0` | Family Guy - Let me introduce you to | Mr. Rupert | 1:01 | **1.7 MB** | 7s | `#shorts 90s sitcom scene` |
| 95 | `Oa8s07agHeY` | 55 burgers, 55 fries, 55 tacos, 55 p | Netflix Is A Joke | 0:48 | **2.4 MB** | 5s | `#shorts 90s sitcom scene` |
| 96 | `V8cH4pkPQw0` | Dave Chappelle - New White People (2 | Classic Comedy | 0:17 | **859.4 KB** | 6s | `#shorts 1970s television` |
| 97 | `CdaXTGsMU9A` | “SF vs. Boston” 🎤: Hanna Evensen -  | Don't Tell Comedy | 0:45 | **2.0 MB** | 4s | `#shorts 1970s television` |
| 98 | `5C_OD4k8nJo` | "Find me a part of America that's no | Comedy Central Sta | 0:57 | **2.0 MB** | 9s | `#shorts 1970s television` |
| 99 | `8E_KwRqt-dI` | There is stupid and then there is th | Coach Basics Baseb | 0:21 | **1.0 MB** | 5s | `#shorts vintage emergenc` |
| 100 | `ESvPcNA6rp0` | How to SINK your Boat #6 - Wavy Boat | Wavy Boats | 0:30 | **1.6 MB** | 5s | `#shorts vintage emergenc` |
| 101 | `0pwKwrBPpSg` | Different siren styles you’ll use re | Fire Department Ch | 0:16 | **691.9 KB** | 4s | `#shorts vintage emergenc` |
| 102 | `8kX9b9mqa8U` | I Blinked and This Happened | Rebecca Zamolo | 0:20 | **1.5 MB** | 5s | `#shorts 1980s broadcast ` |
| 103 | `GxsTJLCigRc` | Are churches still singing songs lik | Faith Holy Church | 0:44 | **2.1 MB** | 6s | `#shorts 1980s broadcast ` |
| 104 | `gx1bD-rdv5E` | Surgery with zero euro 😅🤷‍♀️ #shor | JessB! | 0:16 | **1008.7 KB** | 6s | `#shorts vintage late nig` |
| 105 | `YAL089viHi4` | Joe Biden - "It's called soccer" 🙈� | Footy Ranks - Kenn | 0:14 | **611.2 KB** | 5s | `#shorts vintage late nig` |
| 106 | `R7q9zjx1fB4` | Ringo Starr: It’s ‘impossible’ to pl | Associated Press | 0:43 | **2.2 MB** | 5s | `#shorts vintage late nig` |
| 107 | `rSxV0jQy1KE` | God has given us all the evidence we | Billy Graham Evang | 1:00 | **3.0 MB** | 6s | `#shorts vintage tv debat` |
| 108 | `GQx97ESg2CA` | Larry Bird Keeps It 💯 On The NBA To | BBALL CHRONICLES | 0:40 | **3.6 MB** | 5s | `#shorts vintage tv debat` |
| 109 | `OSus3lMyEQA` | THEN vs NOW: #Trump on #classified # | MS NOW | 0:19 | **790.1 KB** | 4s | `#shorts vintage tv debat` |
| 110 | `8VrWH51UQ90` | Daughter of Mormon Top Leader speaks | Mormon Stories Pod | 1:01 | **4.3 MB** | 6s | `#shorts vintage tv debat` |
| 111 | `qyx1kGlcnCA` | Memorable undressing scene, Carnival | FEATURE FILM | 0:24 | **1.0 MB** | 5s | `#shorts retro public acc` |
| 112 | `NkCoS0HnxTc` | THE COUNSELOR -  The Stockings Scene | A PERFECT LIFE MOM | 1:32 | **4.2 MB** | 5s | `#shorts retro public acc` |
| 113 | `XeldhceOkh0` | Great white shark washed up North Ca | KingNicoplayz | 0:14 | **419.2 KB** | 4s | `#shorts retro public acc` |
| 114 | `p8XodAx2Q80` | Girl burnout on her drag bike | Harley Davidson Pe | 0:26 | **1.5 MB** | 5s | `#shorts retro public acc` |
| 115 | `xts_rI5trmQ` | Scary Things Hidden In Normal Lookin | STYGIANYX | 0:11 | **264.9 KB** | 4s | `#shorts 1960s news sign ` |
| 116 | `xbRcKwbowFM` | Selected Originals - Tourist Trade ( | British Pathé | 1:49 | **4.7 MB** | 4s | `#shorts 1960s news sign ` |
| 117 | `bX-77yIvBrY` | Max Headroom Incident | NIGHT FILES | 1:00 | **4.7 MB** | 5s | `#shorts 1960s news sign ` |
| 118 | `3Xm7wyvRHNU` | Japan's Garbage Disposal System. | XYZ FACTS | 0:35 | **2.7 MB** | 5s | `#shorts 1960s news sign ` |
| 119 | `EqnUiEVgmAg` | Television RCA Sign off Alignment Te | Mystic Frequencies | 0:31 | **875.7 KB** | 11s | `#shorts vintage televisi` |
| 120 | `03e7lBEQNnM` | Evolution of Television (TV) - 1927  | Zaifi Evolution | 0:26 | **915.6 KB** | 6s | `#shorts vintage televisi` |
| 121 | `y8Qqm2DM_RI` | Philco Predicta: The 1950s TV That D | Big Score | 0:23 | **1.2 MB** | 5s | `#shorts vintage televisi` |
| 122 | `Y2vy96pDsG8` | Audio TV test pattern from the fifti | zokbones | 1:01 | **1.4 MB** | 5s | `#shorts vintage televisi` |
| 123 | `9K041di8DD8` | The UK Emergency Alert but for Teach | Twinkl Educational | 0:12 | **508.9 KB** | 4s | `#shorts national anthem ` |
| 124 | `je1zdgVJ0Ic` | OMG… THEY ATEEE 😍🤯 #cheer #stunts  | Divine Cheer | 0:18 | **1.6 MB** | 4s | `#shorts national anthem ` |
| 125 | `rLDEiHKUlL8` | the moment TV switched to color 😲 # | Extraordinaries | 0:38 | **1.7 MB** | 6s | `#shorts 1960s news sign ` |
| 126 | `SZgJLyGJIik` | Their Boat Engine Fell Off | Newsflare | 0:13 | **750.9 KB** | 4s | `#shorts vintage emergenc` |
| 127 | `XuS1pcDi8Vg` | BOSTON TV Test Patterns 1980's , Par | MSTS1 | 2:04 | **7.0 MB** | 6s | `#shorts vintage televisi` |
| 128 | `sI4M4-AWLi4` | SpongeBob as an old timey cartoon! # | Nicktoons | 1:15 | **5.6 MB** | 18s | `#shorts national anthem ` |
| 129 | `HYfowmWzUMw` | The most racist video on the interne | KEEMOKAZI | 0:31 | **1.6 MB** | 5s | `#shorts national anthem ` |
| 130 | `GczlQqrPZLk` | Hurricane simulators are no joke 👀� | House of Highlight | 0:24 | **1.1 MB** | 6s | `#shorts vintage emergenc` |
| 131 | `r3m9OUutEXo` | The Craziest Old Cartoon Moments ran | Fessem  | 0:33 | **1.4 MB** | 6s | `#shorts vintage sitcom b` |
| 132 | `_v1e8AC5SfE` | BLAZING SADDLES : FASTEST GUN IN THE | SCENES OF NOTE | 0:47 | **2.2 MB** | 6s | `#shorts vintage sitcom b` |
| 133 | `5qH-YzAoESQ` | Short skirts #shorts | Ziba Shops Style | 0:07 | **436.2 KB** | 6s | `#shorts vintage sitcom b` |
| 134 | `3oZ4GQJZR9c` | Rule Britannia | Rule Britannia | 0:12 | **596.1 KB** | 5s | `#shorts national anthem ` |
| 135 | `Kuwp-c3QkSo` | George I russian  kid. #russia,#hard | Gyoneko - Fortnite | 0:08 | **166.4 KB** | 5s | `#shorts national anthem ` |
| 136 | `m0vPyINwTNw` | Spring Break 2021 Clearwater Beach F | Dr SulacoPhD | 0:09 | **713.4 KB** | 5s | `#shorts national anthem ` |
| 137 | `OUYVAUZ9Ww8` | WHO SANG “Anti-Hero” BEST?!?🎤🎃 #ta | Sharpe Family Sing | 0:42 | **3.0 MB** | 6s | `#shorts national anthem ` |
| 138 | `4OPK79597bQ` | Thalapathy vijay potical power 🤯🔥  | NANDHA EDITZ | 0:12 | **1.0 MB** | 5s | `#shorts national anthem ` |
| 139 | `b_urLBQ5WG4` | When Paul McCartney Did Comedy with  | Zen no Chikara | 0:27 | **1.9 MB** | 6s | `#shorts national anthem ` |
| 140 | `i-okxLuAv-E` | A.I. Family Guy as 80s Sitcom #short | Nifty Nanners | 0:45 | **1.9 MB** | 6s | `#shorts national anthem ` |
| 141 | `9b4446TTHeQ` | Rollerskating is the world’s best ho | The Griffin Brothe | 0:16 | **1.1 MB** | 5s | `#shorts 1970s game show ` |
| 142 | `LdkpkFvskTs` | ICONIC Tennis Beauties! | Dissent Discourse | 1:00 | **4.3 MB** | 6s | `#shorts 1970s game show ` |
| 143 | `eDyeD4Ma9Pg` | Christopher Reeve refused fake muscl | Luke Sherran | 0:58 | **4.1 MB** | 7s | `#shorts 1970s game show ` |
| 144 | `Bk4Kk3i3_9w` | World’s HOTTEST Skateboard EVER!! | totallyanton | 0:21 | **1.5 MB** | 5s | `#shorts 1960s news sign ` |
| 145 | `nNsq51__Wzc` | POV: you’re 6’9” 400 pounds and book | Hafthor Bjornsson | 0:18 | **1005.2 KB** | 6s | `#shorts 1960s news sign ` |
| 146 | `neZlh6fhHtg` | Did I just find the most unsettling  | Levi McClain | 0:16 | **1.1 MB** | 4s | `#shorts 1960s news sign ` |
| 147 | `r5fFlI7MFeM` | Sonny & Cher "I Got You Babe" on The | The Ed Sullivan Sh | 1:06 | **2.9 MB** | 20s | `#shorts 1970s television` |
| 148 | `V8cH4pkPQw0` | Dave Chappelle - New White People (2 | Classic Comedy | 0:17 | **859.4 KB** | 5s | `#shorts 1970s television` |
| 149 | `qwmRvwdlVEk` | Evolution of School Bus {1980~2023}  | MGC Tube | 0:26 | **1.2 MB** | 6s | `#shorts vintage emergenc` |
| 150 | `NPZmKmXuylg` | 🌊🚤 Don’t you just love the motion  | TheMaryBurke | 0:15 | **610.9 KB** | 11s | `#shorts 1980s broadcast ` |
| 151 | `CKjXmNPZGso` | WORLD'S LONGEST ARMS.. #Shorts | SerumShorts | 0:13 | **1.1 MB** | 5s | `#shorts vintage televisi` |
| 152 | `JAAO8hKtmAw` | If Airlines Were People #shorts | Charlie Berens | 0:53 | **3.0 MB** | 5s | `#shorts vintage televisi` |
| 153 | `wwj6P_BRFFE` | Family Guy - Trump supporters | Mr. Rupert | 0:51 | **3.5 MB** | 18s | `#shorts vintage televisi` |
| 154 | `8Zjvt9FIImE` | Terrible Acting Performances😭🎬#sho | NostalgiaSell | 0:22 | **1.5 MB** | 5s | `#shorts vintage late nig` |
| 155 | `GJSb_Xr-9AA` | No window, no problem with the Samsu | Next Upgrade | 0:16 | **669.4 KB** | 7s | `#shorts retro color bars` |
| 156 | `TB6ctjf8WrY` | Aishwarya Rai Clever Reply To Oprah  | AILSA BINGE  | 0:25 | **800.1 KB** | 6s | `#shorts retro news ancho` |
| 157 | `B0vY6tz82ks` | Nana Patekar scolds reporter on movi | Lehren Retro | 0:59 | **4.2 MB** | 81s | `#shorts retro news ancho` |
| 158 | `CcGwlvqXaIg` | Cristiano Ronaldo Walks Out For His  | DAZN Canada | 0:47 | **3.7 MB** | 88s | `#shorts retro news ancho` |
| 159 | `sI3RhwSF8mo` | LiMu Emu & Doug - SNL | Saturday Night Liv | 2:06 | **4.0 MB** | 10s | `#shorts retro news ancho` |
| 160 | `UU72kcXG1IA` | PASS 👏  THE 👏  MASH 👏  #SNL #Meli | Peacock | 0:24 | **1.1 MB** | 7s | `#shorts retro news ancho` |
| 161 | `8kX9b9mqa8U` | I Blinked and This Happened | Rebecca Zamolo | 0:20 | **1.5 MB** | 5s | `#shorts 1980s broadcast ` |
| 162 | `GxsTJLCigRc` | Are churches still singing songs lik | Faith Holy Church | 0:44 | **2.1 MB** | 5s | `#shorts 1980s broadcast ` |
| 163 | `hlXlMQc_22o` | A Different Angle That We Didnt See  | BOSSnUP Records | 0:39 | **1.7 MB** | 5s | `#shorts classic tv news ` |
| 164 | `W9l4A05Bk8c` | Ivanka's Secret Service detail shows | Fox News | 0:19 | **1.3 MB** | 5s | `#shorts classic tv news ` |
| 165 | `LgNdzbYwsvY` | Top Senate Republican Mitch McConnel | Washington Post | 0:49 | **2.6 MB** | 5s | `#shorts classic tv news ` |
| 166 | `kC99GBqAcZo` | Front door or back door TRIMMED SHAV | puffy_vegas | 1:27 | **5.2 MB** | 10s | `#shorts classic tv news ` |
| 167 | `gx1bD-rdv5E` | Surgery with zero euro 😅🤷‍♀️ #shor | JessB! | 0:16 | **1008.7 KB** | 5s | `#shorts vintage late nig` |
| 168 | `YAL089viHi4` | Joe Biden - "It's called soccer" 🙈� | Footy Ranks - Kenn | 0:14 | **611.2 KB** | 6s | `#shorts vintage late nig` |
| 169 | `R7q9zjx1fB4` | Ringo Starr: It’s ‘impossible’ to pl | Associated Press | 0:43 | **2.2 MB** | 7s | `#shorts vintage late nig` |
| 170 | `GwDpY6g5h-Y` | #golfswing #fyp #waitforit #followth | The Game Illustrat | 0:18 | **1.5 MB** | 6s | `#shorts retro tv show bl` |
| 171 | `7VnhNv-Zv3s` | “IT” was actually so creepy😂 #it #p | Charles Brockman I | 0:50 | **3.5 MB** | 7s | `#shorts retro tv show bl` |
| 172 | `qyx1kGlcnCA` | Memorable undressing scene, Carnival | FEATURE FILM | 0:24 | **1.0 MB** | 7s | `#shorts retro public acc` |
| 173 | `NkCoS0HnxTc` | THE COUNSELOR -  The Stockings Scene | A PERFECT LIFE MOM | 1:32 | **4.2 MB** | 6s | `#shorts retro public acc` |
| 174 | `XeldhceOkh0` | Great white shark washed up North Ca | KingNicoplayz | 0:14 | **419.2 KB** | 5s | `#shorts retro public acc` |
| 175 | `p8XodAx2Q80` | Girl burnout on her drag bike | Harley Davidson Pe | 0:26 | **1.5 MB** | 6s | `#shorts retro public acc` |
| 176 | `r_McKiPFtds` | Hisense Laser TV - Ultra Short Throw | Chinar Tech | 0:11 | **597.6 KB** | 5s | `#shorts retro color bars` |
| 177 | `s9pssc90J-U` | Turning on my Sony Trinitron CRT TV | Solid Nate | 0:19 | **804.8 KB** | 6s | `#shorts retro color bars` |
| 178 | `HSr-urOOoLE` | Adjust Picture Quality On LG Flatron | Technical Subhajit | 0:15 | **1.1 MB** | 5s | `#shorts retro color bars` |
| 179 | `3O-dG6WEBiQ` | Arduino UNO LED Chaser Lights - Cool | Creative SM | 0:41 | **2.9 MB** | 4s | `#shorts retro color bars` |
| 180 | `CdaXTGsMU9A` | “SF vs. Boston” 🎤: Hanna Evensen -  | Don't Tell Comedy | 0:45 | **2.0 MB** | 5s | `#shorts 1970s television` |
| 181 | `5C_OD4k8nJo` | "Find me a part of America that's no | Comedy Central Sta | 0:57 | **2.0 MB** | 5s | `#shorts 1970s television` |
| 182 | `133TgJYS-k0` | Using A 1931 Film Camera 🎞️ #expire | Miles - Expired Fi | 0:30 | **1.5 MB** | 6s | `#shorts live broadcast t` |
| 183 | `kGqC03VxQ9Q` | Elvis Presley - Head to Toe | The Ed Sullivan Sh | 0:26 | **1.6 MB** | 6s | `#shorts live broadcast t` |
| 184 | `VFw8X4kKAhw` | Watch How WILD Rugby Was 50 Years Ag | All Blacks | 0:46 | **3.2 MB** | 11s | `#shorts live broadcast t` |
| 185 | `SZgJLyGJIik` | Their Boat Engine Fell Off | Newsflare | 0:13 | **750.9 KB** | 7s | `#shorts vintage televisi` |
| 186 | `9K041di8DD8` | The UK Emergency Alert but for Teach | Twinkl Educational | 0:12 | **508.9 KB** | 6s | `#shorts national anthem ` |
| 187 | `je1zdgVJ0Ic` | OMG… THEY ATEEE 😍🤯 #cheer #stunts  | Divine Cheer | 0:18 | **1.6 MB** | 6s | `#shorts national anthem ` |
| 188 | `rLDEiHKUlL8` | the moment TV switched to color 😲 # | Extraordinaries | 0:38 | **1.7 MB** | 7s | `#shorts retro color bars` |
| 189 | `r3m9OUutEXo` | The Craziest Old Cartoon Moments ran | Fessem  | 0:33 | **1.4 MB** | 6s | `#shorts vintage sitcom b` |
| 190 | `_v1e8AC5SfE` | BLAZING SADDLES : FASTEST GUN IN THE | SCENES OF NOTE | 0:47 | **2.2 MB** | 6s | `#shorts vintage sitcom b` |
| 191 | `onGdcH0vW50` | Worst line in movie history | BlackLabelExpat | 0:20 | **402.2 KB** | 4s | `#shorts vintage sitcom b` |
| 192 | `5qH-YzAoESQ` | Short skirts #shorts | Ziba Shops Style | 0:07 | **436.2 KB** | 5s | `#shorts vintage sitcom b` |
| 193 | `UXInk1PCsc8` | Cab Calloway 1933 Cartoon of St. Jam | John Corda | 2:40 | **9.8 MB** | 12s | `#shorts classic buddy si` |
| 194 | `8E_KwRqt-dI` | There is stupid and then there is th | Coach Basics Baseb | 0:21 | **1.0 MB** | 27s | `#shorts classic buddy si` |
| 195 | `33W6IuyBybs` | Michael Jordan shows off his JORDANS | Hardwood Heat | 0:39 | **1.7 MB** | 6s | `#shorts classic buddy si` |
| 196 | `ESvPcNA6rp0` | How to SINK your Boat #6 - Wavy Boat | Wavy Boats | 0:30 | **1.6 MB** | 4s | `#shorts vintage emergenc` |
| 197 | `0pwKwrBPpSg` | Different siren styles you’ll use re | Fire Department Ch | 0:16 | **691.9 KB** | 4s | `#shorts vintage emergenc` |
| 198 | `b_urLBQ5WG4` | When Paul McCartney Did Comedy with  | Zen no Chikara | 0:27 | **1.9 MB** | 4s | `#shorts 1980s broadcast ` |
| 199 | `EqnUiEVgmAg` | Television RCA Sign off Alignment Te | Mystic Frequencies | 0:31 | **875.7 KB** | 9s | `#shorts vintage televisi` |
| 200 | `03e7lBEQNnM` | Evolution of Television (TV) - 1927  | Zaifi Evolution | 0:26 | **915.6 KB** | 5s | `#shorts vintage televisi` |
| 201 | `y8Qqm2DM_RI` | Philco Predicta: The 1950s TV That D | Big Score | 0:23 | **1.2 MB** | 5s | `#shorts vintage televisi` |
| 202 | `Y2vy96pDsG8` | Audio TV test pattern from the fifti | zokbones | 1:01 | **1.4 MB** | 5s | `#shorts vintage televisi` |
| 203 | `XuS1pcDi8Vg` | BOSTON TV Test Patterns 1980's , Par | MSTS1 | 2:04 | **7.0 MB** | 6s | `#shorts vintage televisi` |
| 204 | `r5fFlI7MFeM` | Sonny & Cher "I Got You Babe" on The | The Ed Sullivan Sh | 1:06 | **2.9 MB** | 9s | `#shorts vintage late nig` |
| 205 | `i-okxLuAv-E` | A.I. Family Guy as 80s Sitcom #short | Nifty Nanners | 0:45 | **1.9 MB** | 5s | `#shorts national anthem ` |
| 206 | `sI4M4-AWLi4` | SpongeBob as an old timey cartoon! # | Nicktoons | 1:15 | **5.6 MB** | 5s | `#shorts national anthem ` |
| 207 | `HYfowmWzUMw` | The most racist video on the interne | KEEMOKAZI | 0:31 | **1.6 MB** | 4s | `#shorts national anthem ` |
| 208 | `V8cH4pkPQw0` | Dave Chappelle - New White People (2 | Classic Comedy | 0:17 | **859.4 KB** | 4s | `#shorts retro public acc` |
| 209 | `Bk4Kk3i3_9w` | World’s HOTTEST Skateboard EVER!! | totallyanton | 0:21 | **1.5 MB** | 6s | `#shorts 1960s news sign ` |
| 210 | `nNsq51__Wzc` | POV: you’re 6’9” 400 pounds and book | Hafthor Bjornsson | 0:18 | **1005.2 KB** | 4s | `#shorts 1960s news sign ` |
| 211 | `neZlh6fhHtg` | Did I just find the most unsettling  | Levi McClain | 0:16 | **1.1 MB** | 4s | `#shorts 1960s news sign ` |
| 212 | `qwmRvwdlVEk` | Evolution of School Bus {1980~2023}  | MGC Tube | 0:26 | **1.2 MB** | 4s | `#shorts vintage emergenc` |
| 213 | `NPZmKmXuylg` | 🌊🚤 Don’t you just love the motion  | TheMaryBurke | 0:15 | **610.9 KB** | 5s | `#shorts 1980s broadcast ` |
| 214 | `8kX9b9mqa8U` | I Blinked and This Happened | Rebecca Zamolo | 0:20 | **1.5 MB** | 4s | `#shorts 1980s broadcast ` |
| 215 | `PXYQBT_DsdI` | 80s and 90s movies you NEED to watch | Katie Feeney | 0:21 | **379.1 KB** | 4s | `classic cinema 80s 90s m` |
| 216 | `FiDjYBe__AE` | Training In 80s Movies | Vilas Sheldon | 3:40 | **15.4 MB** | 13s | `classic cinema 80s 90s m` |
| 217 | `wwj6P_BRFFE` | Family Guy - Trump supporters | Mr. Rupert | 0:51 | **3.5 MB** | 5s | `#shorts vintage late nig` |
| 218 | `9b4446TTHeQ` | Rollerskating is the world’s best ho | The Griffin Brothe | 0:16 | **1.1 MB** | 4s | `#shorts 1970s game show ` |
| 219 | `LdkpkFvskTs` | ICONIC Tennis Beauties! | Dissent Discourse | 1:00 | **4.3 MB** | 5s | `#shorts 1970s game show ` |
| 220 | `eDyeD4Ma9Pg` | Christopher Reeve refused fake muscl | Luke Sherran | 0:58 | **4.1 MB** | 9s | `#shorts 1970s game show ` |
| 221 | `UU72kcXG1IA` | PASS 👏  THE 👏  MASH 👏  #SNL #Meli | Peacock | 0:24 | **1.1 MB** | 21s | `#shorts retro news ancho` |
| 222 | `rSxV0jQy1KE` | God has given us all the evidence we | Billy Graham Evang | 1:00 | **3.0 MB** | 5s | `#shorts vintage tv debat` |
| 223 | `GQx97ESg2CA` | Larry Bird Keeps It 💯 On The NBA To | BBALL CHRONICLES | 0:40 | **3.6 MB** | 5s | `#shorts vintage tv debat` |
| 224 | `OSus3lMyEQA` | THEN vs NOW: #Trump on #classified # | MS NOW | 0:19 | **790.1 KB** | 5s | `#shorts vintage tv debat` |
| 225 | `8VrWH51UQ90` | Daughter of Mormon Top Leader speaks | Mormon Stories Pod | 1:01 | **4.3 MB** | 5s | `#shorts vintage tv debat` |
| 226 | `W9l4A05Bk8c` | Ivanka's Secret Service detail shows | Fox News | 0:19 | **1.3 MB** | 4s | `#shorts vintage co ancho` |
| 227 | `CLnFQL7VyuM` | Under the Table-Living Room Scene | Rich Meiman | 0:59 | **3.0 MB** | 6s | `#shorts vintage co ancho` |
| 228 | `YAL089viHi4` | Joe Biden - "It's called soccer" 🙈� | Footy Ranks - Kenn | 0:14 | **611.2 KB** | 7s | `#shorts vintage co ancho` |
| 229 | `DN0WfyjjqH0` | Family Guy - Let me introduce you to | Mr. Rupert | 1:01 | **1.7 MB** | 6s | `#shorts 90s sitcom scene` |
| 230 | `Oa8s07agHeY` | 55 burgers, 55 fries, 55 tacos, 55 p | Netflix Is A Joke | 0:48 | **2.4 MB** | 5s | `#shorts 90s sitcom scene` |
| 231 | `hlXlMQc_22o` | A Different Angle That We Didnt See  | BOSSnUP Records | 0:39 | **1.7 MB** | 6s | `#shorts classic tv news ` |
| 232 | `LgNdzbYwsvY` | Top Senate Republican Mitch McConnel | Washington Post | 0:49 | **2.6 MB** | 6s | `#shorts classic tv news ` |
| 233 | `kC99GBqAcZo` | Front door or back door TRIMMED SHAV | puffy_vegas | 1:27 | **5.2 MB** | 10s | `#shorts classic tv news ` |
| 234 | `gx1bD-rdv5E` | Surgery with zero euro 😅🤷‍♀️ #shor | JessB! | 0:16 | **1008.7 KB** | 5s | `#shorts vintage late nig` |
| 235 | `R7q9zjx1fB4` | Ringo Starr: It’s ‘impossible’ to pl | Associated Press | 0:43 | **2.2 MB** | 5s | `#shorts vintage late nig` |
| 236 | `qyx1kGlcnCA` | Memorable undressing scene, Carnival | FEATURE FILM | 0:24 | **1.0 MB** | 6s | `#shorts retro public acc` |
| 237 | `NkCoS0HnxTc` | THE COUNSELOR -  The Stockings Scene | A PERFECT LIFE MOM | 1:32 | **4.2 MB** | 7s | `#shorts retro public acc` |
| 238 | `XeldhceOkh0` | Great white shark washed up North Ca | KingNicoplayz | 0:14 | **419.2 KB** | 5s | `#shorts retro public acc` |
| 239 | `GJSb_Xr-9AA` | No window, no problem with the Samsu | Next Upgrade | 0:16 | **669.4 KB** | 4s | `#shorts retro color bars` |
| 240 | `CdaXTGsMU9A` | “SF vs. Boston” 🎤: Hanna Evensen -  | Don't Tell Comedy | 0:45 | **2.0 MB** | 5s | `#shorts 1970s television` |
| 241 | `5C_OD4k8nJo` | "Find me a part of America that's no | Comedy Central Sta | 0:57 | **2.0 MB** | 5s | `#shorts 1970s television` |
| 242 | `SZgJLyGJIik` | Their Boat Engine Fell Off | Newsflare | 0:13 | **750.9 KB** | 4s | `#shorts vintage emergenc` |
| 243 | `JVTHJ6O7MhM` | Sailboat Slammed by Massive Wave Dur | Wild Wild AI | 0:11 | **728.7 KB** | 5s | `#shorts 1980s broadcast ` |
| 244 | `HcBnSuq8b1o` | BOAT SINKING! FAMILY GOES INTO PANIC | Wavy Boats | 0:46 | **1.8 MB** | 5s | `#shorts 1980s broadcast ` |
| 245 | `CKjXmNPZGso` | WORLD'S LONGEST ARMS.. #Shorts | SerumShorts | 0:13 | **1.1 MB** | 5s | `#shorts 1980s broadcast ` |
| 246 | `JAAO8hKtmAw` | If Airlines Were People #shorts | Charlie Berens | 0:53 | **3.0 MB** | 5s | `#shorts vintage televisi` |
| 247 | `8Zjvt9FIImE` | Terrible Acting Performances😭🎬#sho | NostalgiaSell | 0:22 | **1.5 MB** | 5s | `#shorts vintage late nig` |
| 248 | `3oZ4GQJZR9c` | Rule Britannia | Rule Britannia | 0:12 | **596.1 KB** | 4s | `#shorts national anthem ` |
| 249 | `Kuwp-c3QkSo` | George I russian  kid. #russia,#hard | Gyoneko - Fortnite | 0:08 | **166.4 KB** | 4s | `#shorts national anthem ` |
| 250 | `m0vPyINwTNw` | Spring Break 2021 Clearwater Beach F | Dr SulacoPhD | 0:09 | **713.4 KB** | 4s | `#shorts national anthem ` |
| 251 | `OUYVAUZ9Ww8` | WHO SANG “Anti-Hero” BEST?!?🎤🎃 #ta | Sharpe Family Sing | 0:42 | **3.0 MB** | 6s | `#shorts national anthem ` |
| 252 | `4OPK79597bQ` | Thalapathy vijay potical power 🤯🔥  | NANDHA EDITZ | 0:12 | **1.0 MB** | 6s | `#shorts national anthem ` |
| 253 | `p8XodAx2Q80` | Girl burnout on her drag bike | Harley Davidson Pe | 0:26 | **1.5 MB** | 5s | `#shorts retro public acc` |
| 254 | `cpw5IHYPbl0` | Why you should look for Hot Wheels a | GaryVee | 0:34 | **2.4 MB** | 5s | `#shorts retro public acc` |
| 255 | `rpS_ajZ6ZuY` | Lil Mahomes 🥹🏈 | NFL | 0:14 | **1.3 MB** | 4s | `#shorts retro public acc` |
| 256 | `CSVqk_I7LGc` | You laugh you go to hell | CHIP EATER  | 0:48 | **1.8 MB** | 4s | `#shorts retro public acc` |
| 257 | `rLDEiHKUlL8` | the moment TV switched to color 😲 # | Extraordinaries | 0:38 | **1.7 MB** | 6s | `#shorts retro color bars` |
| 258 | `8E_KwRqt-dI` | There is stupid and then there is th | Coach Basics Baseb | 0:21 | **1.0 MB** | 5s | `#shorts vintage emergenc` |
| 259 | `ESvPcNA6rp0` | How to SINK your Boat #6 - Wavy Boat | Wavy Boats | 0:30 | **1.6 MB** | 5s | `#shorts vintage emergenc` |
| 260 | `0pwKwrBPpSg` | Different siren styles you’ll use re | Fire Department Ch | 0:16 | **691.9 KB** | 5s | `#shorts vintage emergenc` |
| 261 | `b_urLBQ5WG4` | When Paul McCartney Did Comedy with  | Zen no Chikara | 0:27 | **1.9 MB** | 7s | `#shorts national anthem ` |
| 262 | `GwDpY6g5h-Y` | #golfswing #fyp #waitforit #followth | The Game Illustrat | 0:18 | **1.5 MB** | 12s | `#shorts 1970s game show ` |
| 263 | `je1zdgVJ0Ic` | OMG… THEY ATEEE 😍🤯 #cheer #stunts  | Divine Cheer | 0:18 | **1.6 MB** | 7s | `#shorts 1970s game show ` |
| 264 | `jL_CLLezrZw` | Pontoon Boat hits big rock | Boaters List | 0:14 | **665.7 KB** | 8s | `#shorts 1970s game show ` |
| 265 | `xts_rI5trmQ` | Scary Things Hidden In Normal Lookin | STYGIANYX | 0:11 | **264.9 KB** | 5s | `#shorts 1960s news sign ` |
| 266 | `xbRcKwbowFM` | Selected Originals - Tourist Trade ( | British Pathé | 1:49 | **4.7 MB** | 6s | `#shorts 1960s news sign ` |
| 267 | `bX-77yIvBrY` | Max Headroom Incident | NIGHT FILES | 1:00 | **4.7 MB** | 7s | `#shorts 1960s news sign ` |
| 268 | `3Xm7wyvRHNU` | Japan's Garbage Disposal System. | XYZ FACTS | 0:35 | **2.7 MB** | 6s | `#shorts 1960s news sign ` |
| 269 | `r5fFlI7MFeM` | Sonny & Cher "I Got You Babe" on The | The Ed Sullivan Sh | 1:06 | **2.9 MB** | 12s | `#shorts 1970s television` |
| 270 | `V8cH4pkPQw0` | Dave Chappelle - New White People (2 | Classic Comedy | 0:17 | **859.4 KB** | 10s | `#shorts 1970s television` |
| 271 | `9K041di8DD8` | The UK Emergency Alert but for Teach | Twinkl Educational | 0:12 | **508.9 KB** | 7s | `#shorts vintage emergenc` |
| 272 | `GczlQqrPZLk` | Hurricane simulators are no joke 👀� | House of Highlight | 0:24 | **1.1 MB** | 38s | `#shorts vintage emergenc` |
| 273 | `qwmRvwdlVEk` | Evolution of School Bus {1980~2023}  | MGC Tube | 0:26 | **1.2 MB** | 6s | `#shorts vintage emergenc` |
| 274 | `NPZmKmXuylg` | 🌊🚤 Don’t you just love the motion  | TheMaryBurke | 0:15 | **610.9 KB** | 5s | `#shorts 1980s broadcast ` |
| 275 | `nNsq51__Wzc` | POV: you’re 6’9” 400 pounds and book | Hafthor Bjornsson | 0:18 | **1005.2 KB** | 6s | `#shorts 1980s broadcast ` |
| 276 | `EqnUiEVgmAg` | Television RCA Sign off Alignment Te | Mystic Frequencies | 0:31 | **875.7 KB** | 11s | `#shorts vintage televisi` |
| 277 | `03e7lBEQNnM` | Evolution of Television (TV) - 1927  | Zaifi Evolution | 0:26 | **915.6 KB** | 5s | `#shorts vintage televisi` |
| 278 | `y8Qqm2DM_RI` | Philco Predicta: The 1950s TV That D | Big Score | 0:23 | **1.2 MB** | 5s | `#shorts vintage televisi` |
| 279 | `Y2vy96pDsG8` | Audio TV test pattern from the fifti | zokbones | 1:01 | **1.4 MB** | 4s | `#shorts vintage televisi` |
| 280 | `XuS1pcDi8Vg` | BOSTON TV Test Patterns 1980's , Par | MSTS1 | 2:04 | **7.0 MB** | 33s | `#shorts vintage televisi` |
| 281 | `i-okxLuAv-E` | A.I. Family Guy as 80s Sitcom #short | Nifty Nanners | 0:45 | **1.9 MB** | 5s | `#shorts vintage late nig` |
| 282 | `wwj6P_BRFFE` | Family Guy - Trump supporters | Mr. Rupert | 0:51 | **3.5 MB** | 5s | `#shorts national anthem ` |
| 283 | `HYfowmWzUMw` | The most racist video on the interne | KEEMOKAZI | 0:31 | **1.6 MB** | 17s | `#shorts national anthem ` |
| 284 | `r_McKiPFtds` | Hisense Laser TV - Ultra Short Throw | Chinar Tech | 0:11 | **597.6 KB** | 5s | `#shorts retro color bars` |
| 285 | `s9pssc90J-U` | Turning on my Sony Trinitron CRT TV | Solid Nate | 0:19 | **804.8 KB** | 6s | `#shorts retro color bars` |
| 286 | `HSr-urOOoLE` | Adjust Picture Quality On LG Flatron | Technical Subhajit | 0:15 | **1.1 MB** | 7s | `#shorts retro color bars` |
| 287 | `3O-dG6WEBiQ` | Arduino UNO LED Chaser Lights - Cool | Creative SM | 0:41 | **2.9 MB** | 6s | `#shorts retro color bars` |
| 288 | `9fSYKdTLeZk` | The worst line on television ever. | Dimmary | 0:14 | **426.1 KB** | 5s | `#shorts 1970s television` |
| 289 | `jpF0S_mMcJY` | “Don’t Confuse Pretty Shots with Goo | Nate's Film Tutori | 0:21 | **1.5 MB** | 6s | `#shorts 1970s television` |
| 290 | `tS7Cn0IM02Y` | Cinematic Sound Effects (Royalty-Fre | Flame Sound | 1:17 | **3.1 MB** | 9s | `#shorts 1970s television` |
| 291 | `OHHNmj5pASI` | The brilliant Dave Allen 🤭 #comedia | Travelling Tim  | 0:54 | **1.6 MB** | 5s | `#shorts 1970s television` |
| 292 | `8kX9b9mqa8U` | I Blinked and This Happened | Rebecca Zamolo | 0:20 | **1.5 MB** | 5s | `#shorts 1980s broadcast ` |
| 293 | `GxsTJLCigRc` | Are churches still singing songs lik | Faith Holy Church | 0:44 | **2.1 MB** | 5s | `#shorts 1980s broadcast ` |
| 294 | `ezBF3okPPkU` | Zulu Girls Traditional Dance 6 #shor | Avadada TV | 0:05 | **374.1 KB** | 4s | `#shorts vintage televisi` |
| 295 | `133TgJYS-k0` | Using A 1931 Film Camera 🎞️ #expire | Miles - Expired Fi | 0:30 | **1.5 MB** | 6s | `#shorts vintage televisi` |
| 296 | `pK8GFDl0FgA` | 🔥Do you own any HIGH END CD PLAYERS | Techrewinds | 0:09 | **374.4 KB** | 5s | `#shorts vintage televisi` |
| 297 | `gx1bD-rdv5E` | Surgery with zero euro 😅🤷‍♀️ #shor | JessB! | 0:16 | **1008.7 KB** | 5s | `#shorts vintage late nig` |
| 298 | `YAL089viHi4` | Joe Biden - "It's called soccer" 🙈� | Footy Ranks - Kenn | 0:14 | **611.2 KB** | 6s | `#shorts vintage late nig` |
| 299 | `R7q9zjx1fB4` | Ringo Starr: It’s ‘impossible’ to pl | Associated Press | 0:43 | **2.2 MB** | 4s | `#shorts vintage late nig` |
| 300 | `sI4M4-AWLi4` | SpongeBob as an old timey cartoon! # | Nicktoons | 1:15 | **5.6 MB** | 5s | `#shorts national anthem ` |
| 301 | `kGqC03VxQ9Q` | Elvis Presley - Head to Toe | The Ed Sullivan Sh | 0:26 | **1.6 MB** | 5s | `#shorts live broadcast t` |
| 302 | `VFw8X4kKAhw` | Watch How WILD Rugby Was 50 Years Ag | All Blacks | 0:46 | **3.2 MB** | 5s | `#shorts live broadcast t` |
| 303 | `SZgJLyGJIik` | Their Boat Engine Fell Off | Newsflare | 0:13 | **750.9 KB** | 5s | `#shorts 1980s broadcast ` |
| 304 | `r3m9OUutEXo` | The Craziest Old Cartoon Moments ran | Fessem  | 0:33 | **1.4 MB** | 5s | `#shorts vintage sitcom b` |
| 305 | `qyx1kGlcnCA` | Memorable undressing scene, Carnival | FEATURE FILM | 0:24 | **1.0 MB** | 6s | `#shorts vintage sitcom b` |
| 306 | `_v1e8AC5SfE` | BLAZING SADDLES : FASTEST GUN IN THE | SCENES OF NOTE | 0:47 | **2.2 MB** | 5s | `#shorts vintage sitcom b` |
| 307 | `onGdcH0vW50` | Worst line in movie history | BlackLabelExpat | 0:20 | **402.2 KB** | 5s | `#shorts vintage sitcom b` |
| 308 | `5qH-YzAoESQ` | Short skirts #shorts | Ziba Shops Style | 0:07 | **436.2 KB** | 5s | `#shorts vintage sitcom b` |
| 309 | `CdaXTGsMU9A` | “SF vs. Boston” 🎤: Hanna Evensen -  | Don't Tell Comedy | 0:45 | **2.0 MB** | 5s | `#shorts 1970s television` |
| 310 | `5C_OD4k8nJo` | "Find me a part of America that's no | Comedy Central Sta | 0:57 | **2.0 MB** | 5s | `#shorts 1970s television` |
| 311 | `JVTHJ6O7MhM` | Sailboat Slammed by Massive Wave Dur | Wild Wild AI | 0:11 | **728.7 KB** | 5s | `#shorts 1980s broadcast ` |
| 312 | `HcBnSuq8b1o` | BOAT SINKING! FAMILY GOES INTO PANIC | Wavy Boats | 0:46 | **1.8 MB** | 4s | `#shorts 1980s broadcast ` |
| 313 | `CKjXmNPZGso` | WORLD'S LONGEST ARMS.. #Shorts | SerumShorts | 0:13 | **1.1 MB** | 6s | `#shorts 1980s broadcast ` |

### Prune & Storage Reclamation Events

| Timestamp | Videos Pruned | Reclaimed Space | Reason |
| :--- | :--- | :--- | :--- |
| 2026-09-17T15:57:02.962Z | 13 | 62.6 MB | Storage limit reached |
| 2026-09-17T16:27:07.323Z | 13 | 43.6 MB | Storage limit reached |
| 2026-09-17T16:48:14.062Z | 13 | 22.5 MB | Storage limit reached |
| 2026-09-17T17:05:03.591Z | 13 | 17.4 MB | Storage limit reached |
| 2026-09-17T17:13:05.637Z | 13 | 23.8 MB | Storage limit reached |
| 2026-09-17T17:38:17.018Z | 13 | 27.3 MB | Storage limit reached |
| 2026-09-17T17:49:10.314Z | 13 | 19.1 MB | Storage limit reached |
| 2026-09-17T17:54:36.674Z | 13 | 29.9 MB | Storage limit reached |
| 2026-09-17T18:00:23.519Z | 13 | 22.0 MB | Storage limit reached |
| 2026-09-17T18:06:55.561Z | 13 | 28.0 MB | Storage limit reached |
| 2026-09-17T18:14:50.956Z | 13 | 24.5 MB | Storage limit reached |
| 2026-09-17T18:23:39.832Z | 13 | 25.2 MB | Storage limit reached |
| 2026-09-17T18:27:12.178Z | 13 | 26.8 MB | Storage limit reached |
| 2026-09-17T18:53:28.579Z | 13 | 27.4 MB | Storage limit reached |
| 2026-09-17T19:00:28.439Z | 13 | 19.9 MB | Storage limit reached |
| 2026-09-17T19:17:43.424Z | 13 | 24.6 MB | Storage limit reached |
| 2026-09-17T19:24:10.706Z | 13 | 27.7 MB | Storage limit reached |
| 2026-09-17T19:26:27.253Z | 13 | 44.3 MB | Storage limit reached |
| 2026-09-17T19:57:02.391Z | 13 | 26.5 MB | Storage limit reached |
| 2026-09-17T20:02:57.528Z | 13 | 18.3 MB | Storage limit reached |

---

## 4. Machine & Environmental Health

| Parameter | Specification / State |
| :--- | :--- |
| **Host OS** | Darwin 25.6.0 (arm64) |
| **CPU Model** | Apple M3 Pro (11 cores) |
| **System Total RAM** | 18 GB |
| **Node.js Process RSS Memory** | **125.1 MB** |
| **Node.js Process Heap Used** | **19.3 MB** |
| **Node.js Version** | v22.18.0 |

---

## 5. Operational Recommendations for Exhibition Longevity

1. **Daily Quota Budgeting**:
   - Default YouTube Data API v3 quota is **10,000 units/day** (resetting at 00:00 UTC).
   - At your observed burn rate of **919.9 units/hr**, the installation will consume approximately **7359 units** in an 8-hour exhibition day.
   - *Recommendation*: ✅ Quota rate is well within safe thresholds for full-day public exhibition.

2. **Storage Management & Disk Runway**:
   - Configured storage ceiling is **500 MB** (`FALLBACK_MAX_STORAGE_MB`).
   - Current storage usage is **20.4%** (102.0 MB).
   - Storage growth rate during this test was **11 MB/hr**.
   - *Recommendation*: Automatic FIFO/LRU pruning proactively keeps disk usage below the cap by evicting oldest YouTube downloads while protecting local media. Disk headroom is healthy.

3. **Continuous Gallery Operation**:
   - When spectators are actively interacting, MediaPipe queries YouTube in background batches.
   - If internet disconnects or quota is exhausted, `VideoIngestService` transparently fails over to tokenized semantic keyword matching from local MP4 files without dropping frames on the 6 CRT monitors.

---
*Report automatically generated by V-FEED [06] Performance & Longevity Suite.*