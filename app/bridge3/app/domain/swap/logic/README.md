# Swap Logic

These functions keep the **Swap form elements** logically
in sync with each other.

They are mobx reactions that consolidate and encapsulate 
various logic scattered across the ui code in bridge2. In order 
to **separate concerns** and collect related business logic
in one please, they are all

They are designed to be triggered by both **user actions** and
**effect functions** of other reactions.  In the Swap store's 
`initialize()` method, they are create in **reverse order** so that
a desired effect is always initialized before its trigger.

