# **V-FEED[06]**

**Keywords:** CRT, MediaPipe, TV, Interference, Streaming.

**Conceptualization:** V-FEED [06] is a transmedia installation that bridges contemporary imagery with obsolete hardware. The narrative projects ephemeral digital content (YouTube Shorts) onto analog television. By projecting a format designed for individual vertical consumption onto a fragmented wall of 6 CRT monitors, the installation seeks to provide a new reading of the image. The viewer ceases to be a passive consumer and becomes a human antenna; their physical presence is the sole medium that tunes, distorts, or corrupts the image, referencing a phenomenon that occurred in analog television. It is a tribute to the work of video artist Joshua Ellingson (<https://ellingson.tv/>).

**Innovation, Relevance, and Significance:** The innovation of V-FEED [06] lies in "computational recycling": it uses a body recognition system (MediaPipe) not to build clean interfaces, but to emulate analog glitches in real-time. It is relevant in the current context of short, sanitized video saturation, inviting viewers to interact with the installation through their entire body rather than just their hands. The goal is to reclaim industrial aesthetics within an academic design environment.

**Synthetic Proposal Description:** The installation consists of a vertical totem of 6 CRT monitors (2x3) acting as a single large-format screen. A system built in JavaScript captures YouTube Shorts and renders them onto a WebGL canvas. Using a camera, the software tracks the viewer's position and maps their movements to visual distortion parameters (RGB split, static noise, frame drops/glitches). The result is a distorted mirror where the web manifests as a malleable and fragmented electrical signal.

**Featured Quote:** _"V-FEED [06] Six cathode ray tubes, a YouTube feed, and a motion sensor: the user is the only missing wire in the system."_

---

# **TECHNICAL SPECIFICATION SHEET (COMPLEMENTARY MATERIAL)**

**Required Equipment, Materials, and Technology:** The installation requires 6 functional CRT televisions (14" to 20") with RCA or VGA inputs. A computer (mini tower/PC) will run the software, connect the webcam, and drive the video outputs. For capture, an HD webcam (60 fps) is used; for the television matrix, an HDMI extender and HDMI to RCA/VGA adapters are used for each TV. The tech stack is based on Node.js for the local server, MediaPipe for body tracking, and Three.js/GLSL for real-time shader processing and video fragmentation.

**File Formats and Technical Specifications:** The system runs as a local web application (Localhost). Videos stream from the YouTube Data API v3 in 1080p resolution (vertical). Interference effects execute via fragment shaders (GLSL) that manipulate the video texture at the pixel level without perceptible latency. The video output is configured as an extended desktop of 1080x1920 pixels, logically subdivided for each monitor.

**Required Space:** A minimum area of 2 meters wide by 3 meters deep is required. The monitor "totem" occupies a floor footprint of 1.5m x 0.8m x 1.8m. It is imperative to have a controlled lighting environment (dim or indirect light) to maximize the visibility of the CRT phosphor glow and prevent glare on the curved glass screens.

**Interactivity and Audience Engagement:** Interactivity is implicit and requires no peripheral devices. The system detects when audience members enter the interaction zone (3 meters). Hand movements generate localized interference "blobs" on the corresponding monitors. If the viewer remains motionless, the image fades into static; if they move quickly, the signal fragments. Participation is active and exploratory, inviting the audience to "touch" the air to alter the image.

**Operation and Assembly:** Mounting requires an industrial rack made of reinforced steel or wood capable of supporting the weight of the 6 monitors (approx. 15 kg each). Signal and power cables must be organized yet visible to maintain the technical aesthetic. Operation is managed through the computer: a script launches the server and opens the projection browser. It requires an Ethernet internet connection to ensure smooth YouTube feed streaming.
