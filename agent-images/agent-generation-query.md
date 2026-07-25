
For every agent directory under agent-images, read the complete character prompt from
  metadata.json.

  For each agent, generate three images:
  - south
  - south-west
  - south-east
  providing prior renders to image gen for reference in generating the others.

  Use the complete metadata prompt as the character description. Add these constraints:
  - compose the character as 32x32 pixel art
  - compact readable silhouette, approximately 26–30 pixels tall
  - crisp stepped edges
  - solid extremely thick black pixel outlines
  - blocky pixel shading
  - no blur or antialiasing
  - solid opaque #f6f6f7 background
  - no transparency, text, shadows, or extra objects

  Save each original generated image directly in the agent directory as:
  - south-generated.png
  - south-west-generated.png
  - south-east-generated.png

  Then resample each generated image to exactly 125x125 pixels:
  magick input.png -filter Lanczos -resize 125x125 -unsharp 0x1 output.png
  saving the final files directly in the same agent directory as:
  - south.png
  - south-west.png
  - south-east.png

  Do not create image subdirectories. 
