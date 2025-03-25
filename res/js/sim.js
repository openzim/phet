const emptyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII='

if (window?.phet?.chipper?.mipmaps && Array.isArray(window.phet.chipper.mipmaps['BRAND/logo.png'])) {
  window.phet.chipper.mipmaps['BRAND/logo.png'].map((image) => {
    image.src = emptyImage
  })
}

const removeOldLogo = (image) => {
  if (
    $(image).attr('xlink:href').includes('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAREAAABsCAYAAABNX4YlAAA') ||
    $(image).attr('xlink:href').includes('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIkAAAA2CAYAAADzuLppAAA') ||
    $(image).attr('xlink:href').includes(emptyImage)
  ) {
    $(image).parent().parent().parent().remove()
  }
  if (window?.phet?.joist?.sim) {
    window.phet.joist.sim.showPopup = () => {}
  }
}

$(() => {
  $('body').on('DOMNodeInserted', (e) => {
    if (e.target.tagName === 'image') {
      $(e.target).one('load', () => {
        removeOldLogo(e.target)
      })
    }
  })

  $('image').each((idx, elm) => removeOldLogo(elm))
})
