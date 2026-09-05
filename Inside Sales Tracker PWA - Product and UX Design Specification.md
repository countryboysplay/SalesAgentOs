# Inside Sales Tracker PWA

## 1. Product Definition

### Working Name
**SalesTrack**

Working title only. Branding can be changed later without affecting the product architecture.

### Product Purpose

SalesTrack is a personal sales-performance tracker designed specifically for inside sales agents.

The agent should be able to answer three questions immediately:

1. How am I doing today?
2. How am I doing this month?
3. How am I doing this year?

The application is intentionally not a CRM.

It does not manage leads, customers, territories, sales teams, call lists, or shared company data.

It is the individual salesperson's private sales ledger and performance dashboard.

---

# 2. Core Technical Constraint

## Local-Only Architecture

The application must operate with:

- No backend server
- No hosted database
- No user account
- No authentication service
- No cloud synchronization
- No analytics service requiring user data transmission
- No API dependency for core functionality
- No internet connection after initial installation

All sales information must remain on the device where the user installs the application.

### Local storage responsibilities

Use two distinct local mechanisms conceptually:

**PWA Application Cache**
Stores the application shell and static assets needed for offline operation.

**Local Structured Data Storage**
Stores sales records, goals, settings, categories, history, preferences, and backup metadata on the device.

The development implementation should use modern browser-supported PWA storage rather than the deprecated historical Application Cache API.

---

# 3. Product Philosophy

The application should feel less like entering information into a spreadsheet and more like keeping score during a game.

The agent should be able to record a sale in several seconds.

The application should heavily emphasize:

- Today's performance
- Progress toward goal
- Current month
- Current year
- Streaks
- Pace
- Earnings
- Personal bests

Data entry should be extremely lightweight.

The application should never make the salesperson feel like they are doing administrative work.

---

# 4. Primary User

An individual inside sales representative who:

- Works primarily from a phone or desktop dialer
- Wants to privately track personal performance
- Makes multiple sales per day
- Measures performance in dollars and number of sales
- Has daily, monthly, and annual sales goals
- May receive sales commissions
- Wants to know whether they are ahead or behind pace
- Does not need management access
- Does not want to maintain spreadsheets

One installation represents one salesperson.

---

# 5. Privacy Principles

SalesTrack should store as little personally identifiable customer information as possible.

### Sales records should not require:

- Customer name
- Customer phone number
- Address
- Email
- Account number

The app is a performance tracker rather than a customer database.

An optional short note may be provided, but the UI should discourage entering sensitive customer information.

---

# 6. Primary Navigation

Mobile navigation uses a fixed bottom navigation bar.

### Navigation

**Home**

**Sales**

**Insights**

**Settings**

A prominent floating **+ Sale** button sits above the navigation bar.

The + Sale button must be accessible from every primary screen.

---

# 7. First Launch Experience

The first launch should take less than two minutes.

## Screen 1: Welcome

Headline:

**Track the number that matters. Yours.**

Supporting copy:

Track your sales, goals, pace, and performance without accounts, servers, or spreadsheets.

Primary button:

**Set Up My Tracker**

Secondary information:

**Your sales data stays on this device.**

---

# 8. Initial Setup

## Step 1: Agent Information

Fields:

- First name or display name
- Optional initials

Do not require an email address.

---

## Step 2: Sales Goals

Allow entry of:

### Daily Goal
Example:

$500

### Monthly Goal
Example:

$10,000

### Annual Goal
Example:

$120,000

The agent may independently enable or disable any goal.

---

## Step 3: Commission

Question:

**Do you want to track estimated commission?**

Options:

- Yes
- No

If yes:

### Default Commission Rate

Example:

5%

The system should later allow individual sales to override this rate.

---

## Step 4: Work Schedule

Used for pace calculations.

Allow selection of normal working days:

- Monday
- Tuesday
- Wednesday
- Thursday
- Friday
- Saturday
- Sunday

Default:

Monday-Friday

Optional:

Exclude selected holidays or non-working dates manually.

---

## Step 5: Finish

Summary:

Daily Goal  
Monthly Goal  
Annual Goal  
Commission  
Working Days

Button:

**Start Tracking**

---

# 9. Home Screen

The Home screen is the primary experience.

It should always open focused on **Today**.

## Header

Example:

**Good afternoon, Jonathan**

Below:

Friday, September 4

Small offline indicator:

**Saved on this device**

Do not prominently display technical terminology.

---

# 10. Today's Score Card

Largest component on the screen.

Example:

### TODAY

**$742**

of $500 goal

**148%**

Progress bar or circular progress visualization.

Supporting statistics:

**3 Sales**

**$247 Avg Sale**

**+$242 Above Goal**

When no daily goal exists:

Show:

**$742 Sold Today**

rather than percentage-based progress.

---

# 11. Quick Performance Strip

Directly below today's card.

Three compact cards:

### Month
$7,850

78.5% of goal

### Year
$83,420

69.5% of goal

### Commission
$3,921

Estimated

Tapping any card opens its detailed view.

---

# 12. Pace Card

The system should calculate whether the agent is ahead or behind the pace necessary to reach the monthly goal.

Example:

### Monthly Pace

**Ahead by $612**

Current:
$7,850

Expected by today:
$7,238

Alternative state:

**Behind pace by $438**

Color should communicate status without relying entirely on color.

Possible secondary wording:

**You need $536/day for the remaining 9 workdays.**

---

# 13. Today's Sales List

Below performance cards.

### Today's Sales

Example:

9:14 AM  
Aeration + Overseeding  
**$389**

11:42 AM  
Lawn Program  
**$214**

2:07 PM  
Lawn Program  
**$139**

Each row should be swipeable or tappable.

Tap opens Sale Details.

Swipe actions can provide:

- Edit
- Delete

Delete always requires confirmation.

---

# 14. Add Sale Experience

The most important workflow in the entire product.

The salesperson should be able to enter a basic sale using approximately three interactions.

Pressing **+ Sale** opens a bottom sheet.

## Primary Field

### Sale Amount

Large numeric keypad.

Example:

**$389.00**

---

## Optional Category

Display recently used categories as quick chips.

Example:

Lawn Program

Aeration

Overseeding

Grub Control

Upsell

Other

Categories are user-configurable.

---

## Commission

Default rate automatically applied.

Example:

Commission  
5%

Estimated: $19.45

Can be overridden per sale.

---

## Date and Time

Automatically:

**Now**

Can be changed.

---

## Optional Note

Collapsed by default.

Button:

**Add note**

---

## Primary Action

**Record Sale**

Once pressed:

- Save instantly
- Close panel
- Update dashboard
- Show subtle success feedback

Example:

**$389 added**

Avoid lengthy success screens.

---

# 15. Optional Sale Details

A sale record may contain:

### Required

- Sale amount
- Sale date
- Sale time

### Optional

- Category
- Commission rate
- Short note
- Status

---

# 16. Sale Status

Every sale starts as:

**Active**

User can later change it to:

- Active
- Cancelled
- Adjusted

This allows the tracker to represent sales that later fall off.

Cancelled sales should remain in history for auditing but should no longer contribute to net sales.

---

# 17. Adjusting a Sale

An agent should not have to delete an incorrect sale.

Options:

**Edit Sale**

or

**Mark Cancelled**

Cancellation screen:

Sale  
$389

Reason:

Optional

Date cancelled:

Default today

This allows reporting to distinguish:

Gross Sales

from

Net Sales

---

# 18. Gross vs Net Sales

The application should internally understand:

### Gross Sales
Total value of every recorded original sale.

### Cancellations
Value removed because sales were cancelled.

### Net Sales
Gross Sales minus cancellations.

The main dashboard should display **Net Sales** by default.

Detailed reporting can expose both.

---

# 19. Sales Screen

The Sales section acts as the agent's personal ledger.

Header:

### Sales

Search/filter area.

Tabs:

**Day**

**Month**

**Year**

**All**

---

# 20. Day View

Date selector at top.

Example:

< September 4 >

Summary:

$742 Net Sales

3 Sales

$247 Average

$37.10 Estimated Commission

Below:

Chronological sales list.

---

# 21. Month View

Header:

September 2026

Primary totals:

**$7,850**

Net Sales

Supporting values:

27 Sales

$291 Average Sale

$392.50 Commission

---

# 22. Monthly Calendar

Calendar days display small sales totals.

Example:

MON  TUE  WED  THU  FRI

31   1    2    3    4

     $420 $611 $389 $742

Days with strong performance can display subtle success indicators.

Selecting a day shows that day's sales.

---

# 23. Month Progress

Display:

Monthly Goal  
$10,000

Sold  
$7,850

Remaining  
$2,150

Progress  
78.5%

Workdays Remaining  
9

Required Per Workday  
$238.89

---

# 24. Year View

Header:

### 2026

Hero metric:

**$83,420**

of $120,000

69.5%

---

# 25. Annual Progress Chart

Use a monthly bar chart.

JAN  
$9.2K

FEB  
$10.3K

MAR  
$8.9K

APR  
$11.1K

etc.

The user should instantly see stronger and weaker months.

Annual metrics:

- Net sales
- Gross sales
- Number of sales
- Average sale
- Estimated commission
- Best month
- Best day

---

# 26. Insights Screen

Insights should answer useful performance questions without becoming an enterprise analytics platform.

Sections:

### Performance
### Pace
### Records
### Categories

---

# 27. Performance Insights

Time selector:

7 Days

30 Days

90 Days

Year

All Time

Metrics:

- Net sales
- Number of sales
- Average sale
- Estimated commission
- Average sales per working day
- Goal attainment rate

---

# 28. Sales Trend

Simple line chart.

Display daily or weekly sales depending on selected range.

Allow toggling:

**Sales $**

**Sale Count**

Avoid complicated chart controls.

---

# 29. Personal Records

Display cards such as:

### Best Day
$1,482

August 21

### Best Month
$14,392

June 2026

### Largest Sale
$1,240

July 14

### Most Sales in One Day
8

June 3

---

# 30. Streaks

Optional motivational metric.

Example:

### Goal Streak

**4 Workdays**

Daily goal reached

The system must only count configured working days.

Do not punish the user for weekends or excluded days.

---

# 31. Category Performance

Example:

Lawn Program  
$42,410

Aeration  
$18,820

Grub Control  
$13,110

Other  
$9,080

Allow sorting by:

- Revenue
- Number of sales
- Average sale

---

# 32. Goal Management

Settings > Goals

Allow:

### Daily Goal

### Monthly Goal

### Annual Goal

Each may be independently changed.

Changes should apply prospectively rather than rewriting historical goal performance unless the user explicitly chooses otherwise.

This requires maintaining goal history.

Example:

January-August goal:
$9,000/month

September onward:
$10,000/month

Historical reports should continue using the goal that was active at that time.

---

# 33. Commission Settings

Settings > Commission

Default commission rate:

5%

Optional multiple commission rules.

Example:

Program Sales  
5%

Upsells  
3%

Other  
5%

The commission rule may be associated with a sales category.

Individual sales can override the default.

The application should label all commission figures:

**Estimated Commission**

This avoids presenting the tracker as payroll software.

---

# 34. Categories

Settings > Sale Categories

Default starter categories could include:

- Primary Sale
- Upsell
- Other

Do not hard-code industry-specific products.

Users should be able to create categories such as:

- Lawn Program
- Aeration
- Overseeding
- Grub Control

or for another industry:

- Subscription
- Upgrade
- Renewal

Each category can have:

- Name
- Optional icon
- Default commission percentage
- Active/inactive status

Inactive categories remain attached to old sales.

---

# 35. Local Data Model

Conceptually separate data into the following groups.

## Agent Profile

Contains:

- Display name
- Created date
- App preferences

---

## Sales Records

Each record should contain a unique internal identifier and:

- Amount
- Date
- Time
- Category
- Commission percentage
- Calculated commission
- Optional note
- Status
- Created timestamp
- Modified timestamp
- Cancellation information where relevant

---

## Categories

- ID
- Name
- Commission rule
- Active state
- Sort order

---

## Goals

- Goal type
- Amount
- Effective start date
- Effective end date

Goal history should be preserved.

---

## Settings

- Currency
- Workdays
- Appearance
- Week start
- Commission settings
- Dashboard preferences

---

# 36. Data Storage Rule

No sales information should be stored remotely.

Data persistence should use structured local browser storage suitable for potentially thousands of sales records.

The PWA shell should also be cached locally so the application can launch offline.

---

# 37. Offline Behavior

The app must work identically whether online or offline.

The user should be able to:

- Launch app
- Add sales
- Edit sales
- Delete sales
- View dashboard
- View charts
- Change goals
- Export data
- Import backups

without internet access.

There should be no offline error screen because being offline is a normal operating condition.

---

# 38. Backup Strategy

Because there is no backend, backups are essential.

Settings > Data

Prominent section:

### Protect Your Sales History

Supporting text:

Your sales history exists only on this device. Create a backup periodically if you want to protect it from device loss, browser resets, or storage removal.

Buttons:

**Create Backup**

**Restore Backup**

---

# 39. Full Backup

Create Backup should export all application information:

- Sales
- Categories
- Goals
- Settings
- Commission rules
- Historical configuration

Use a single portable backup file.

Example filename:

SalesTrack-Backup-2026-09-04

The exact underlying file format is an implementation decision, but it should be machine-readable and restorable.

---

# 40. Restore Backup

Restoring should show:

Backup Date

Sales Records

Date Range

Example:

September 4, 2026

1,482 Sales

January 3, 2025 - September 4, 2026

Options:

**Replace Existing Data**

or

**Cancel**

Do not automatically merge datasets in version one.

Merging introduces duplicate-management complexity.

---

# 41. CSV Export

Separate from backup.

Button:

**Export Sales CSV**

CSV is intended for:

- Personal spreadsheets
- Tax/accounting reference
- Reporting
- Moving data elsewhere

Columns could include:

- Date
- Time
- Amount
- Category
- Status
- Commission Rate
- Estimated Commission
- Note

CSV export should not be treated as an application backup.

---

# 42. Storage Health

Settings > Data should show:

### Local Storage

Sales Records  
1,482

Data Range  
Jan 3, 2025 - Sep 4, 2026

Last Backup  
Aug 29, 2026

This gives the user confidence that their information exists locally.

---

# 43. Backup Reminder

Optional setting:

**Backup Reminder**

Choices:

- Off
- Weekly
- Monthly

Since there is no server, this should be a local device reminder where supported.

It should never transmit information externally.

---

# 44. Data Reset

Settings > Data

Bottom of screen:

### Reset App

Button:

**Delete All Local Data**

Require a deliberate confirmation.

Example:

Delete 1,482 sales and all settings from this device?

User must enter:

DELETE

before confirmation.

---

# 45. Appearance

Settings > Appearance

Options:

- System
- Light
- Dark

The app should be fully designed for both light and dark environments.

---

# 46. Recommended Visual Direction

The application should feel modern, fast, and focused.

Not playful.

Not corporate CRM software.

Not spreadsheet-like.

## Light Mode

Background:
soft off-white

Cards:
white

Primary text:
near-black

Secondary:
cool gray

Accent:
strong electric blue

Positive:
green

Warning:
amber

Negative:
red

---

# 47. Dark Mode

Background:
deep charcoal/navy

Cards:
slightly elevated graphite

Primary text:
near-white

Secondary:
cool gray

Accent:
bright blue

Positive:
green

Warning:
amber

Negative:
coral/red

Avoid pure black backgrounds.

---

# 48. Typography

Use a modern system-oriented sans serif.

Characteristics:

- Highly legible
- Large numeric displays
- Compact labels
- Strong distinction between data and supporting text

Performance numbers should visually dominate the interface.

Example hierarchy:

Today's Sales  
small label

**$742**  
very large

148% of goal  
medium

---

# 49. Card Design

Cards should use:

- Moderate corner radius
- Minimal border
- Very subtle shadow
- Generous internal spacing
- Little decorative chrome

Cards exist to expose information, not decorate the interface.

---

# 50. Numbers

Numbers are the primary visual language.

Use large typography for:

- Sales
- Goals
- Commission
- Percentage
- Pace

Examples:

**$12,482**

**124%**

**$624/day**

Avoid excessive icons around core metrics.

---

# 51. Progress Visualization

Goals should primarily use horizontal progress bars.

Example:

MONTHLY GOAL

$7,850 / $10,000

████████████████░░░░

78.5%

Progress beyond 100% should still display meaningfully.

Example:

**124%**

Rather than clipping visually at 100%.

---

# 52. Performance States

## Behind

$412 Behind Pace

Use restrained warning styling.

Do not use shame-oriented language.

---

## On Pace

On Track

---

## Ahead

$728 Ahead of Pace

---

## Goal Reached

Monthly Goal Reached

$10,442

104%

---

# 53. Celebration Behavior

Celebrations should be subtle.

Use them when:

- Daily goal reached
- Monthly goal reached
- Annual goal reached
- New personal record

Examples:

Small confetti burst

Brief haptic feedback where available

Animated progress bar

Do not display celebration animations after every sale.

---

# 54. Home Screen Example

Conceptual layout:

```text
Good afternoon, Jonathan
Friday, September 4
Saved on this device

TODAY
$742
148% of $500 goal
████████████████████

3 Sales        $247 Avg
+$242          Above Goal

MONTH          YEAR           COMMISSION
$7,850         $83,420        $3,921
78.5%          69.5%          Est.

MONTHLY PACE
Ahead by $612

You need $239/day for the remaining
9 working days to reach $10,000.

TODAY'S SALES

2:07 PM
Lawn Program                  $139

11:42 AM
Lawn Program                  $214

9:14 AM
Aeration                      $389

              + SALE

Home       Sales       Insights       Settings
```

---

# 55. Quick Add Example

```text
ADD SALE

$ 389.00

CATEGORY
[Lawn Program] [Aeration] [Upsell]

Commission
5%                         $19.45 est.

Date
Today

Time
Now

+ Add note

[ RECORD SALE ]
```

The keyboard should focus directly on the sale amount when opened.

---

# 56. Insights Example

```text
INSIGHTS

[7D] [30D] [90D] [YEAR] [ALL]

NET SALES
$83,420

SALES
327

AVG SALE
$255

EST. COMMISSION
$4,171

SALES TREND
[chart]

PERSONAL RECORDS

Best Day
$1,482

Best Month
$14,392

Largest Sale
$1,240

Goal Streak
4 Days
```

---

# 57. Empty States

New accounts should not look broken.

## No sales today

Headline:

**Nothing on the board yet.**

Supporting text:

Record your first sale when it comes in.

Button:

**Add Sale**

---

## No historical records

**Your sales history will appear here.**

---

# 58. Mobile-First Behavior

Primary target:

Phone installed as a PWA.

Design should prioritize one-handed use.

Requirements:

- Large tap targets
- Bottom navigation
- Sale button reachable with thumb
- No tiny tables
- No horizontally scrolling dashboards
- No hover-dependent controls
- Forms optimized for numeric entry
- Charts readable at approximately 360px width

---

# 59. Desktop Behavior

The app may also be opened on desktop.

Desktop should not become an entirely different interface.

Recommended layout:

Left navigation rail

Main dashboard content

Maximum content width

Multiple metric cards in a row

Sales list beside performance components where space permits

The underlying information architecture remains identical.

---

# 60. PWA Installation

The app should be installable from supported browsers.

Once installed:

- Launches in standalone mode
- Has an application icon
- Has a splash/loading experience
- Works offline
- Retains local sales information
- Feels visually independent from the browser

---

# 61. Loading Screen

Simple.

Centered app mark.

**SalesTrack**

Small text:

Your personal sales ledger

No server-loading language such as:

Connecting...

Syncing...

Fetching account...

The application has nothing to connect to.

---

# 62. App Status Language

Avoid:

Synced

Cloud

Account

Server

Connected

Instead use:

Saved

Stored locally

On this device

Backup created

---

# 63. Accessibility

Minimum requirements:

- Do not rely exclusively on color
- Proper contrast
- Large numeric text
- Minimum touch target approximately 44px
- Screen reader labels
- Clear focus state
- Charts accompanied by text summaries
- Respect reduced-motion preferences

---

# 64. Performance Expectations

Because everything is local, interactions should feel immediate.

Target perception:

Add sale:
instant

Dashboard update:
instant

Changing date:
instant

Opening month:
instant

Charts:
instant

There should be no artificial loading spinner for operations that involve only local data.

---

# 65. Calculations

## Daily Net Sales

Active sales for selected day minus cancellations applicable to the underlying sales.

---

## Average Sale

Net active sales value divided by number of active sales.

---

## Daily Goal %

Daily net sales divided by applicable daily goal.

---

## Monthly Goal %

Monthly net sales divided by applicable monthly goal.

---

## Annual Goal %

Annual net sales divided by applicable annual goal.

---

# 66. Monthly Pace

Calculate expected sales according to configured working days rather than simple calendar days.

Example:

Monthly Goal:
$10,000

Working Days:
20

Expected Daily Pace:
$500

10 working days completed:

Expected:
$5,000

Actual:
$5,850

Result:

**$850 Ahead of Pace**

---

# 67. Required Remaining Pace

Formula concept:

Remaining Monthly Goal

divided by

Remaining Working Days

Example:

Goal:
$10,000

Current:
$7,850

Remaining:
$2,150

Remaining workdays:
9

Required:

**$238.89/day**

---

# 68. Annual Pace

Same concept using monthly or working-day progression through the calendar year.

Display:

**Ahead of Annual Pace**

or

**$6,240 Behind Annual Pace**

Also calculate:

Required average monthly sales for remaining months.

---

# 69. Historical Integrity

Changing settings should not silently rewrite past performance.

Examples:

Changing commission from 5% to 6% today should not change a sale from March.

Changing monthly goal from $8,000 to $10,000 should not automatically change January's historical goal attainment.

Records should preserve the values that applied when they were created.

---

# 70. Undo

After deleting or cancelling a sale, display a temporary:

**Sale cancelled**

**Undo**

This reduces accidental changes.

---

# 71. Search and Filtering

Sales ledger can filter by:

- Date
- Category
- Status
- Amount range

Do not build complex query functionality.

Search should mainly apply to optional notes.

---

# 72. Data Import

Version one should support restoring the application's own backup format.

CSV importing should be considered optional and secondary.

Importing arbitrary CSV structures creates unnecessary onboarding complexity.

---

# 73. What the App Should Not Become

Do not add:

- Lead management
- CRM
- Sales pipeline
- Customer database
- Phone dialer
- Email
- SMS
- Company login
- Manager portal
- Employee rankings
- Shared leaderboards
- Server-based analytics
- Team chat
- Payroll processing
- Cloud synchronization
- AI coaching
- Call recording
- Call transcription

Those features violate or dilute the intended product.

---

# 74. Version 1 Feature Scope

## Required

- PWA installation
- Offline operation
- Device-local data
- Onboarding
- Add sale
- Edit sale
- Cancel sale
- Delete sale
- Daily reporting
- Monthly reporting
- Annual reporting
- Sales ledger
- Daily goal
- Monthly goal
- Annual goal
- Goal history
- Pace calculation
- Sales categories
- Commission tracking
- Personal records
- Basic charts
- CSV export
- Full backup
- Full restore
- Data reset
- Light mode
- Dark mode

---

# 75. Version 1.1 Possibilities

Do not build these until the base product is proven.

Possible additions:

- Widget-style home-screen summaries
- Local notification reminders
- Custom fiscal year
- Multiple commission plans
- Advanced streaks
- Sales target forecasting
- More export formats
- Import historical sales from CSV
- PIN/biometric app lock where supported
- Multiple local salesperson profiles
- Custom dashboard cards

---

# 76. Development Priorities

Claude Code should prioritize development in this order:

### 1. Data integrity
Sales must never disappear because of navigation or application refresh.

### 2. Offline reliability
Every core function must work disconnected.

### 3. Fast sale entry
Entering a sale is the highest-frequency action.

### 4. Accurate calculations
Daily, monthly, annual, commission, and pace calculations must agree everywhere.

### 5. Backup and restoration
Local-only architecture makes this a core feature rather than an optional utility.

### 6. Mobile usability
The installed phone experience is the primary experience.

### 7. Visual polish
Once the above behaviors are correct.

---

# 77. Development Acceptance Tests

The product should not be considered complete until these scenarios work.

## Offline Test

Install app.

Disconnect internet.

Close app.

Reopen app.

Add a sale.

Close app.

Reopen.

Sale still exists.

---

## Persistence Test

Create 100 sales across multiple months.

Reload the application.

Restart device/browser.

All data remains intact.

---

## Backup Test

Create sales.

Create backup.

Delete local application data.

Restore backup.

All sales, goals, categories, and settings return.

---

## Cancellation Test

Add:

$500 sale

Dashboard:
$500

Cancel sale.

Dashboard:
$0 net

History still displays the original $500 cancelled sale.

---

## Goal Change Test

January goal:
$8,000

February onward:
$10,000

Review January later.

January continues comparing performance against $8,000.

---

## Commission Test

Sale A:
$500 at 5%

Commission:
$25

Sale B:
$500 at 3%

Commission:
$15

Total estimated commission:
$40

---

## Working Day Test

Agent works Monday-Friday.

Daily goal streak achieved Friday.

Saturday and Sunday pass without sales.

Monday should continue the streak rather than resetting it.

---

# 78. Final Product Principle

SalesTrack should answer this instantly:

**Where do I stand?**

The user should never need to manually calculate:

- Today's total
- Month-to-date
- Year-to-date
- Remaining goal
- Required pace
- Average sale
- Estimated commission
- Best performance

The salesperson enters sales.

The application keeps score.

Everything stays on their device.