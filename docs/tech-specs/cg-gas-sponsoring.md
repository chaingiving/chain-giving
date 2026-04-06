# Chain.Giving Gas Sponsoring

## Gas Sponsorship and management for each role

### Benefiary Gas Sponsorship

All beneficiary wallet transactions to use CG tokens should be sponsored by the token issuer organization to make the experience seemless.

### Organization Owner Gas Sponsorship

As Organization owners are typically NPO workers or project manager, it would be desirable to have them be able to set up their programs without having to obtain any tokens to pay for gas, ideally the Organization contract would have a stash of funds to pay for any required gas fees on behalf of the users.

### Chain Giving registry owner, Chain Giving global administrators

Chain Giving registry owner should pay for their own gas, they should also be responsible for monitoring the organizations gas stash in case it runs low.
The stash top up can be done as a service to organizations and invoiced to them as an off chain set up or maintenance fee.

## Gas sponsorship implementation requirements

Gas sponsorship should be implemented in a separate contract that can be configured to decide which party is responsible to manage.
By default it will be managed by the Chain Giving registry owner but it could be handed over to the Organization owner if they want to self manage.