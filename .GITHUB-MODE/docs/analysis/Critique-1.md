# Problems discussed

- **False-dichotomy / bad narrative framing (security vs viral growth):** The “why” doc frames the move as _fun chaos_ → _boring governance_, which alienates the existing community and makes the proposal sound defensive rather than enabling.

- **Messaging that dismisses current users and workflows:** Describing local mode as high-risk in absolute terms can read as contempt for existing users. The better framing is that local mode has meaningful security and governance limitations for some environments, while still serving valid development use cases.

- **“Multiplayer” value is buried instead of leading:** The docs under-sell the multi-entity / multi-agent template model (multiple instances collaborating asynchronously) and instead lead with restrictions and compliance.

- **Core architecture mismatch: state-heavy agent vs ephemeral GitHub Actions:** The implementation plan assumes a lift-and-shift of local paths (embedded runner, local files, LanceDB) into Actions, ignoring that runners are fresh and short-lived.

- **No credible persistent-memory strategy:** The proposal claims persistent memory but doesn’t explain how memory survives container death between runs.

- **Naive “git as state” approach is unworkable:** Committing text memory files might work, but committing a **binary vector DB** (LanceDB) in a high-frequency CI loop creates repo bloat and merge-conflict chaos.

- **Missing explicit deliverable: state hydration/dehydration adapters:** The architecture needs a concrete mechanism and workflow (download snapshot → run → upload snapshot) and a defined storage target (e.g., object storage / artifacts / R2), not hand-waving.

- **Overreliance on GitHub platform security (“secure by construction” fallacy):** Sandboxing prevents “delete your hard drive,” but doesn’t prevent malicious logic running _inside_ the sandbox.

- **Skill supply-chain risk underestimated (Claw Hub vector):** Malicious or compromised skills can exfiltrate secrets from a trusted CI environment (OIDC/secrets/tokens), potentially making the attack _easier_ once centralized.

- **No skill quarantine / vetting protocol:** The docs don’t require verified skills, hash pinning, trusted registries, or mandatory scanning gates before the action runs.

- **Missing automated security gates despite referenced tooling:** Tools mentioned (e.g., skill scanners / guards) aren’t integrated as required steps in the runtime workflow (policy enforcement is absent).

- **Misleading “experience convergence” / parity claim:** Promising local-like responsiveness in GitHub mode ignores CI latency physics and sets users up for disappointment.

- **Latency not designed for (UI/UX gap):** GitHub-mode interactions become ticket-like (minutes of waiting), breaking conversational flow unless the UX explicitly embraces async.

- **No optimistic CLI/terminal progress strategy:** Without clear remote status visualization (provisioning, runner start, hydration, scanning, execution), users perceive the system as hanging or broken.

- **“Happy-path engineering” throughout:** Multiple sections assume best-case behavior (state, security, latency) without handling real operational constraints and failure modes.

### Raw discussion

Welcome to the critique. Today we're dissecting a submission titled open claw GitHub mode, a pretty massive suite of design docs proposing a transition for the popular open claw AI agent, to a governed environment on GitHub.
Actions right? This is a high stakes pivot. We're talking about moving a tool that's famous for its vibe, coding feel on a laptop to a lockdown enterprise pipeline. Let's see if the architecture actually holds up
the analysis, why document does a good job identifying the project's existential crisis. You know, security versus viral growth, but it creates this false dichotomy that might really alienate its core community.
Hold on. I've read that why document? It's pretty blunt about the current state. It frames the local version as having serious security and governance exposure, and suggests it is likely to accumulate vulnerabilities over time. Is that really a false dichotomy? It feels kind of like a harsh truth.
Oh, it is a harsh truth, but it's a marketing disaster. The document frames the whole thing as moving from fun, viral weekend project to stewardship and governance, which a CISO might love exactly, but think about the 100,000 developers who starred this repo because they love the chaos. They love that immediacy. By describing the current state as under-governed and the future as reliable infrastructure, the proposal just sounds incredibly defensive. It signals to hobbyists that spontaneity is being deprioritized in favor of process.
So you think they're effectively firing their user base just to please the enterprise in
a way. Yeah, and they don't have to. The fix here is to reframe GitHub mode not as a safety layer, but as a multiplayer enablement feature. You have to sell the utility, not the restriction.
Multiplayer is a bit of a buzz word, though. How do you actually ground that in this text without it sounding like, you know, fluff?
You have to rewrite the introduction and transitioning sections of that GitHub mode analysis, wi file right now those sections are basically apologizing for the move right instead, they should be highlighting the multi entity template model, which is buried deep in the implementation plan.
I saw that model. It was essentially describing how you can have multiple instances of the agent running at once Exactly.
But look at the potential there. If I'm running open claw locally. It's just me and the bot. If I push it to GitHub mode, I'm essentially cloning my agent's personality and skills into a shared team repo. Okay? It enables asynchronous collaboration. My agent can fix bugs while I'm sleeping. Your agent can then come in and review the PR my agent made.
Okay, I see the shift. So rather than saying we're moving to GitHub to stop you from accidentally deleting your hard drive, you say we're moving to GitHub so your agent can work on the team while you're offline.
Precisely, you pitch the narrative that GitHub mode lets a user export their soul, which is what they call the personality file, to a shared space. That is a feature on lock. It changes the vibe from corporate compliance to, I don't know, squad mode.
That definitely saves the tone. But if we're moving this soul to the cloud, we run into a massive technical wall that I don't think this proposal sees at all.
You're talking about the architecture I am.
The technical implementation plan completely glazes over the fundamental conflict between open clause state heavy architecture and the ephemeral nature of GitHub actions.
This is the single biggest hole in the entire suite of documents, the source material, specifically that dot, GitHub dash mode.md. File emphasizes reusing core paths like pi, embedded runner and memory Lance. DB, yeah, they seem to think they can just lift and shift the local code into a container and call it a day,
but a GitHub action is born and dies in minutes. It starts totally fresh every single time open. Claw relies on a local vector database, Lance DB and local markdown files like Soul, dot, MND to remember anything correct.
If the brain runs in a standard GitHub action, it has total Amnesia The moment the action completes. The proposal mentions persistent memory as a selling point, but there's zero explanation of how that memory survives the death of the container.
I assume they just commit the changes back to the repo. The document mentions git based state that
might work for text files, like memory.md sure you can commit a markdown file, but have you ever tried to commit a binary vector database like Lance dB, inside a high frequency CICD loop
that sounds like merge conflict hell, and the file sizes would blow up the dot Git folder immediately.
It's totally unworkable. The architecture section needs a dedicated state management strategy that explicitly defines how the memory Lance DB and local files are preserved between runs without bloating the Git history.
So if they can't just git push the database, what's the actual. Mechanism. How do we make this section functional
in dot, GitHub, dot mode, dot implementation plan.md, they need to add a specific deliverable for state hydration adapters. You can't leave this abstract. They have to specify exactly where the brain lives when the bot is asleep.
So we're talking about s3
or something like it. It
could be s3 or GitHub artifacts or a service like Cloudflare r2 which they actually reference in the malt workers source material, but totally failed to integrate here. The document needs a workflow diagram description that shows the check in checkout process. Okay, walk me through that. It should look like this. Step one, the action wakes up. Step two, the hydration adopter downloads the latest memory, lands snapshot from external storage, not from Git, right. Step three, the agent executes its task, updates its memory in the local container. Step four, the agent dehydrates by uploading the new snapshot back to storage. Then step five, the action shuts down,
and without that specific cycle, the continuous intelligence promise in section four is just a lie.
It's worse than a lie. It's a broken product. Imagine asking the bot, hey, fix the bug you found in the last run, and the bot just says, What bug? Who are you? Who am I?
Right? It's 51st dates, but for code,
exactly now, assuming they solve the memory problem, we have to talk about trust. The security model relies way too heavily on github's native infrastructure, while underestimating the risks of the claw hub skill supply chain.
I thought the security section was actually pretty strong. I mean, they talk about OIDC, environment secrets, strict permission scoping. It solves the god mode problem, where a local agent has root access to your laptop in GitHub mode, it's sandboxed.
It solves the infrastructure problem. It prevents the agent from deleting your hard drive, but it does not prevent the agent from being evil inside the sandbox. The proposal argues that moving to GitHub makes everything secure by construction, but the source material itself indicates that malicious skills are a major vector.
You mean the claw Havoc malware campaign they mentioned in the background research?
Yes, claw Havoc wasn't an infrastructure hack. It was a logic hack. It was a skill that looked helpful a code formatter, but it was privately exfiltrating API keys to a third party server. If a user installs that compromised skill into their GitHub repository, the secure by construction environment actually makes it worse. How does it make it worse? It's sandboxed. It gives the malware a trusted, authorized environment to operate in the GitHub. Action has access to your repo secrets, your AWS keys, your NPM tokens, because it needs them to do its job. Oh, if the skill logic is malicious, it just reads those secrets and curls them out. The firewall doesn't stop it, because the action needs outbound Internet access to fetch dependencies,
that is terrifying. So the walls are strong, but the inmate is armed correct.
The suggestion here is to introduce a skill quarantine or a vetting protocol specifically for the GitHub runtime plane you can't trust the software just because the server is secure,
that sounds like we're adding a lot of friction to the developer experience, though quarantine sounds like delay. How do we implement that without killing the whole vibe?
Security is friction, but it can be automated. Friction in GitHub mode.md, under security, they need to add a requirement for static analysis gates, and they should explicitly reference tools they already mentioned, like auxland or claw guard.
So before the bot even wakes up, we scan the skills. Before the bot
even runs in the implementation plan, they need to define a policy that prevents the GitHub action from initiating if package dot JSON includes skills that haven't been verified. They need to implement a hash check against a trusted skill registry
I see. So if I try to install claw format or v2 and the hash doesn't match the known good version, the action just fails immediately, exactly.
And furthermore, they should explicitly mention integrating a tool like claw hatch, which is also listed in their ecosystem as a mandatory step in the GitHub mode, check dot YAML workflow. This tool scans skill definitions for malicious patterns like obfuscated network calls.
So we move from trust the platform to verify the payload.
Yes, because right now, the proposal assumes that if the door is locked, the house is safe, they're forgetting that they've invited a vampire inside.
Okay, let's shift gears to the user experience. We've talked about the back end. But what does this actually feel like to use the
product thesis of experience convergence, claiming both local and GitHub mode should feel like one product is technically misleading because of the inherent latency of CICD pipelines.
I noticed that. Claim in the idea document, it says users shouldn't have to relearn open claw per surface. That just sounds like a standard product goal. Why is it misleading?
Because of physics, a local CLI command executes in milliseconds. You type, refactor this, and text starts streaming instantly. In GitHub mode, you trigger the agent with a comment on a pull request, right and then you wait. You wait for the web hook to fire. You wait for GitHub to allocate a runner. You wait for the container image to pull you wait for NPM install. You wait for the hydration step we just designed for them.
We're talking 45 seconds to a minute before the bot even starts to think.
Minimum, probably two minutes on a free tier runner, if you promise the user parity, and then you give them a two minute lag for a simple question, they're going to hate the product. The chat interface becomes a ticket system
that just destroys the conversational flow. So should they just abandon the idea of parity?
No, they need to design for the difference. The suggestion is to be transparent about the slow thinking versus fast thinking modes, and design the UI to bridge that gap.
Slow thinking implies deep work that might actually be a benefit if they frame it correctly. How do we fix the user's expectations?
They should modify dot GitHub mode, the idea.md to define distinct interaction models, synchronous, local for fast iteration and asynchronous audit for GitHub mode. But you can't just explain it in the docs. You have to solve it in the terminal.
How do you solve a two minute wait in a terminal?
You lie? Or will you visualize the wait? Okay, explain that in the command runtime section of the implementation plan, they need to specify an optimistic UI strategy for the CLI. When I trigger a remote job, my local terminal shouldn't just hang or show a spinning loader.
It should show me exactly what's happening on the server.
Yes, use the Ask progress library, which, by the way, is already in their dependency list to visualize the remote GitHub action status directly in the local terminal. It should say provisioning, runner, hydrating, memory, scanning skills, thinking.
That actually sounds really satisfying. It turns the weight into a progress bar. You know, it's working exactly.
It changes the psychology from Is it broken, to it's working hard, and they should also cite their multi worker proof of concept with Cloudflare workers as a potential middle ground. If a user just wants to ask, what does this variable do that doesn't need a full GitHub action container that can run on a lightweight worker for way lower latency.
That's a smart, tiered approach. Fast worker for chat, heavy runner for actual coding.
So let's wrap this up. We have a solid proposal that is currently failing on narrative, memory, security, depth and user expectation.
It's a classic case of great tech, poor story combined with a lot of happy path engineering.
Here is the punch list for the rewrite? First, reframe the narrative from safety to multiplayer. Don't tell them you're taking away their toy. Tell them you're giving them a clone army.
Second, solve the amnesia problem. If you don't build the hydration and dehydration adapters for Lance, DP, the bot is completely useless.
Third, secured supply chain infrastructure gates are not enough. You need auxlant and trusted registries to stop
the claw Havoc vector
and finally, own the latency. Don't promise instant gratification on a CICD pipeline. Build an optimistic UI that makes the weight feel like progress.
We invite the listener to refine the architecture doc based on this feedback and submit the revised parity matrix. This has the potential to be a category defining shift for open claw, but only if they respect the complexity of the new environment they're moving into. Thanks for listening to the critique.
