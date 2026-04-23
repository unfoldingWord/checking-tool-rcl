import React, { useCallback } from 'react'
import PropTypes from 'prop-types'
import { makeStyles } from '@mui/styles'
import Popover from '@mui/material/Popover'
import Divider from '@mui/material/Divider'
import { Typography } from '@mui/material'
import { CgClose } from 'react-icons/cg'
import useWindowEvent from '../helpers/useWindowEvent'
import IconButton from '@mui/material/IconButton'

const useStyles = makeStyles(() => ({
  popover: {
    padding: '0.75em',
    maxWidth: '400px',
  }
}))

const PopoverComponent = ({
  popoverVisibility,
  title,
  bodyText,
  positionCoord,
  onClosePopover,
}) => {
  const classes = useStyles();

  const onEscapeKeyPressed = useCallback((e) => {
    if (e.key === 'Escape' || e.keyCode === 27) {
      onClosePopover();
    }
  }, [onClosePopover]);

  useWindowEvent('keydown', onEscapeKeyPressed)

  return (
    <div>
      <Popover
        classes={{ paper: classes.popover }}
        open={popoverVisibility}
        anchorEl={positionCoord}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        onClose={onClosePopover}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          
          <Typography
            component="div"
            sx={{
              fontSize: '1.2em',
              fontWeight: 'bold',
              mb: 1,
            }}
          >
            {title}
          </Typography>

          <IconButton
            key='lexicon-close-button'
            onClick={onClosePopover}
            title='Close Lexicon'
            aria-label='Close Lexicon'
            sx={{
              pt: 0,
              ml: 'auto',
              mr: 0.5,
            }}
          >
            <CgClose id='lexicon-close-icon' color='black' />
          </IconButton>

        </div>

        <Divider />

        <Typography
          component="div"
          sx={{ pt: 1, pb: 1.5 }}
        >
          {bodyText}
        </Typography>

      </Popover>
    </div>
  );
}

PopoverComponent.propTypes = {
  popoverVisibility: PropTypes.any,
  title: PropTypes.any,
  bodyText: PropTypes.any,
  positionCoord: PropTypes.any,
  onClosePopover: PropTypes.func,
};

export default PopoverComponent;