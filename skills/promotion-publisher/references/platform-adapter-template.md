# Platform adapter template

Add one reference file per newly integrated platform. Keep the core workflow in `SKILL.md` unchanged.

## Required sections

### Identity

- Platform name and canonical domain
- Supported post/product types
- Target audience and channel-specific tone

### Capability profile

- Official connector/API/CLI availability
- Draft create/update support
- Public publish or scheduling support
- Authentication method
- Rate limits, review gates, CAPTCHA, and automation restrictions

Verify unstable details with current official documentation. Do not infer a write API from the existence of a read API.

### Content mapping

- Title/body/description limits
- Tags, topics, communities, or categories
- Cover, image, GIF, video, and link behavior
- Required platform-specific fields

### Draft procedure

- Exact entry point
- Create vs update behavior
- Remote ID extraction
- Authoritative saved-draft signal
- State sidecar fields

### Publish procedure

- Exact confirmation card shown to the user
- Final action that creates the public side effect
- Public URL and status verification
- Retry rules for slow or ambiguous responses

### Safety and community rules

- Self-promotion limits
- Duplicate-post and vote-solicitation rules
- Manual-only steps
- Conditions that require stopping for the user

## Registry update

After adding the adapter, add one routing bullet to `SKILL.md`. Do not copy the core workflow into the adapter.
