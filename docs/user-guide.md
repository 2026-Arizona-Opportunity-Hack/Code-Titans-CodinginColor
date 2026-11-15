# User guide

How each kind of person uses CIC Learn, task by task. Button and screen names are the ones you see in the app. For setting the system up, see [setup.md](setup.md).

Contents: [Students](#students) · [Teachers](#teachers) · [Curriculum authors](#curriculum-authors) · [CIC admins](#cic-admins) · [Teachers outside CIC](#teachers-outside-cic) · [Reviewers](#reviewers) · [CIC's own dashboard (API key)](#cics-own-dashboard-api-key) · [Privacy in one page](#privacy-in-one-page)

## Students

Students have no account, email or password. They need two things from their teacher's login sheet: the **class code** and **three secret words** (for example `maple-tiger-blue`).

### Open your lesson
1. Open the link printed on your sheet. It signs you in. Or go to the site, press **Open my lesson**, type the **Class code** and **Your secret words**, and press **Open my lesson**.
2. You land on **Your learning path**: your modules in order. The next step is highlighted. Later steps are locked until you finish the one before.
3. If you joined after the class started, a banner tells you where the class is. You start there, and earlier modules stay open if you want to catch up.

Closing the browser tab signs you out, so a shared Chromebook stays private. Use **Not you? Sign out** if someone else will use it next.

### Inside a module
A module is a short path of steps. A typical one is: pretest, slides or video, a check, a worksheet, an exit question and a post-test.

| Step | What to do |
|---|---|
| **Pretest** and **post-test** | Answer every question. You see no scores, and hints are off. They measure what you learned, so do your best. You can submit each only once |
| **Slides or video** | Read or watch, then press **I've finished this step**. If the author set a minimum time, the button counts down first |
| **Check** | Short questions with feedback. A hint is available |
| **Worksheet** | Type your answers. They save as you type. Written answers are scored by your teacher |
| **Coding exercise** | Write Python and press **Run** to see what it prints, or **Check my code** to run the tests. Each test shows pass or fail, what was expected and what you got. When you are ready, press **Submit my code** (or **Submit what I have**). **Start over** puts back the starter code |
| **Exit question** | One short reflection |

### Hints
On a check, worksheet or coding exercise, press **Need a hint?**, then describe what you are stuck on and press the button to ask. The hint is a nudge, never the answer. The first hint is a gentle question, the next names the idea, and later ones show a tiny example on a different problem. You get a limited number of hints each day. Your teacher can see what students asked about so they know what to teach again.

### Code runner
Open the menu and choose **Code runner** for a free practice space. It is not graded and your teacher does not see it. Python runs on your own device, so the first run downloads about 12 MB and needs internet.

### Using a phone or keyboard
Student screens are laid out for a phone first. Everything works with a keyboard. In the code box, press Esc and then Tab to leave the box.

### If something goes wrong
- **"Class code or student words are incorrect":** check for typos. After many wrong tries the class is paused for a few minutes. Ask your teacher.
- **Lost your words:** ask your teacher for new ones. The old words stop working.
- **"Getting Python ready" never finishes:** the network blocks the Python download. Tell your teacher.

## Teachers

Teachers (CIC instructors) sign in at `/login/` with the email and temporary password from their invite. First sign-in: choose a new password (12 or more characters) and set up an authenticator app. After that you sign in with password plus a six-digit code.

### Create a class
1. **Classes, New class.** Give it a name and choose your school. Dates are optional.
2. **Add students from a CSV.** Download the template or use your own. The only column you need is **displayName**. An optional **externalId** column holds a school student ID. Any other column, such as a birthdate, is dropped in your browser and never uploaded. Up to 500 students per file.
3. A **preview** shows who will be added and which rows will be skipped, before anything is saved. Press the commit button when it looks right.
4. To add one student later, use **Add a student** on the class page. You can enter their grade (6 to 12, optional). They start at the module the class is on. A grade can also be set or changed later with **Save grade** on the student's page.

### Choose what the class learns
Open **Assigned modules**. Add modules from the published list and use **Move up** and **Move down** to set the order. Each assignment keeps the module version it was given, so a lesson does not change mid-way for students. If the author publishes a new version, move your class to it from the module's **Classes using this module** panel.

Under **Where late joiners start**, set **Class is currently on**. A student added later starts there.

### Give students their logins
Open **Login sheet** and create login words. Each student gets three words, shown **once**. **Print** the sheet or copy the links. If a student loses theirs, create new words for that student and the old ones stop working. **Class settings** can also make a new class code if it leaks.

### Watch progress
| Page | What it tells you |
|---|---|
| **Progress** | Where every student is, module by module. Lists of students who are **stuck** or **have not started** |
| **Learning gain** | Pretest to post-test improvement for a module, for the class and for each student and concept |
| **Concepts** | Which ideas the class has mastered, weakest first, so you know what to reteach |
| **Worksheets to review** | Written answers waiting for your score and feedback |
| **Hints and struggles** | What students asked the AI tutor about, and what to reteach first |
| **Gradebook** | Every student's grade, completion, scores, gain and hints. **Download CSV** for credit records. Each download is logged |
| A student's page | Per-step state, attempts, score and time. For coding exercises you can read the code they submitted |

**Class settings** let you tune when a student counts as stuck: wrong attempts, time over the estimate, days without starting, and school days of inactivity.

### Duplicate names
If two students share a name, the roster flags a possible duplicate. Open the student you want to remove and use the merge option to combine the two. The result keeps the better result for each step, and pretest and post-test keep the earlier submission so gain is not inflated.

### Archive a class
**Class settings, Archive this class** when the term ends. Nothing is deleted.

## Curriculum authors

Authors are CIC admins and instructors an admin has marked as **Curriculum author**. Open **Curriculum**.

### Start from a printed worksheet or slide deck
1. Press **Draft from a file (AI)**.
2. Choose a PDF (up to 4.5 MB) or a PowerPoint `.pptx` (up to 10 MB).
3. Wait 20 to 60 seconds. You can press **Hide (keep drafting)** and carry on. When it finishes, the editor opens.
4. Read the banner: **check every question and answer**, add a YouTube video or remove that step, then **Save draft** and **Publish**. The draft is yours to edit. Students see nothing until you publish.

The AI makes a pretest and post-test on the same concepts, check questions, worksheet prompts taken from the file, and an exit question. It can be wrong, so always read the answers.

### Start from scratch
**New module** starts from a template: pretest, slides or video, check, worksheet, exit question, post-test. Use **Add a step before the post-test** to add a video, slides (PDF, PowerPoint or Google Slides), a check, a worksheet, a **Coding exercise (Python)** or an exit question.

- **Questions** have a type (pick one, written answer and so on), choices with the correct one marked, and a **concept** tag. Concept tags power the mastery and gain reports. A pretest and post-test must cover the same concepts.
- **Coding exercise:** write instructions, optional starter code and a private reference solution, then add tests. An **output** test runs the program with some input and compares what it prints. A **call** test evaluates an expression such as `add(2, 3)` after the program runs and compares the result. Students see the tests and never see the solution.
- **Expand all / Collapse all** and the outline on the left keep a long module manageable.

### Publish
**Save draft** keeps your work. **Publish** checks the module (a pretest and post-test exist, every question has a concept and an answer, video links are valid) and makes a new immutable version. Your own classes move to it automatically. Other teachers' classes stay on the version they have until their teacher moves them. **Versions** lists every version.

A module that any class has assigned cannot be deleted. Unassign it first. Admins can delete any module. Authors can delete only their own.

## CIC admins

### First admin
The first admin is created from the command line. See [setup.md](setup.md#7-create-the-first-admin).

### Everyday tasks
| Task | Where |
|---|---|
| Add a school | **Schools, Add a school.** Choose **CIC** for CIC instructors or **External** for a partner teacher |
| Invite staff | **Users, Invite someone.** Name, email, role, school. Tick **Curriculum author** for authors. Role changes take effect the next time that person signs in |
| Group classes | **Cohorts.** Create one and add classes to it |
| Approve a teacher from outside CIC | **Access requests** (see below) |
| See how external classes are used | **Usage.** Per class: teacher, number of students, modules assigned and recent activity. No student details |
| Create a key for CIC's dashboard | **API keys** (see below) |
| See what happened | **Audit log.** Key changes, exports, publishes and access-request decisions |

Admins can see every CIC class. They cannot open an external teacher's class, roster or progress.

## Teachers outside CIC

Teachers at a partner school can run their own classes on CIC's curriculum without joining CIC.

1. Open `/request-access/` on the site. Fill in **Your name**, **Email**, **Your school or organization** and an optional note.
2. A CIC admin reviews it under **Access requests**. **Approve** creates an external school (or uses an existing one) and sends an invite. **Deny** closes it.
3. The teacher signs in like any other (password, then authenticator code), creates a class, imports a roster, assigns published modules and prints login sheets. Everything in the [Teachers](#teachers) section applies.

CIC cannot see their students. It sees only usage: for each class, the teacher, number of students, modules assigned and when it was last active.

## Reviewers

A reviewer can browse and preview published modules, read-only. A reviewer cannot see any class or student data, and no write action works with a reviewer account. Sign in at `/login/` and open **Curriculum**.

## CIC's own dashboard (API key)

CIC's reporting tools can read aggregated results through a read-only API.

1. An admin opens **API keys**, enters a label such as "CIC dashboard" and creates the key.
2. The key is **shown once**. Copy it then. Only a hash is stored, so a lost key cannot be recovered, only revoked and replaced.
3. Call the API with the key in a header:

   ```bash
   curl -H "x-api-key: <your key>" https://<api-url>/v1/read/cohorts
   ```

Responses are aggregates only: no names, no student IDs. Any group with fewer than 5 students is returned with its numbers hidden. The list of endpoints is in [api.md](api.md#7-read-api-for-cics-org-dashboard).

## Privacy in one page

- A student record is a name, a school and a class. No email, birthdate or address. Two optional extras exist: a school-issued student ID, and a grade (6 to 12) a teacher can enter, which appears in the gradebook.
- Extra columns in an uploaded class list never leave the teacher's browser.
- Student secret words are stored only as a keyed hash, so nobody (including admins) can read them back.
- Student names are never sent to the AI model. It gets the answers only as a list of things not to say, and the server checks every hint before a student sees it.
- Student code runs in the student's own browser, not on our servers.
- External teachers' students are invisible to CIC.
